import { AppDataSource } from "../config/data-source";
import { Call, CallOutcome, Lead, STAGES_REQUIRING_REASON } from "../entities";
import { AuthUser } from "../types";
import { canAccessLead } from "../utils/lead-scope";
import { applyCallCompletion } from "./call-log.service";

export interface CallWrapUpInput {
  notes: string;
  outcome?: CallOutcome;
  lead_status?: string;
  closed_reason?: string;
  closed_reason_notes?: string;
  next_followup?: string;
  duration_minutes?: number;
}

export function isAnsweredCall(call: Call): boolean {
  return !!(call.answered_at || (call.duration_minutes > 0 && call.outcome === CallOutcome.CONNECTED));
}

export function needsCallWrapUp(call: Call): boolean {
  return isAnsweredCall(call) && !!call.ended_at && !call.wrap_up_completed;
}

/**
 * Agent wrap-up after a connected Tata call ends.
 * Applies deferred call completion, saves notes, and optionally moves lead stage.
 */
export async function completeCallWrapUp(
  callId: string,
  user: AuthUser,
  input: CallWrapUpInput
): Promise<{ call: Call; lead: Lead | null }> {
  const notes = input.notes?.trim();
  if (!notes) {
    const err: any = new Error("Notes are required to complete the call wrap-up");
    err.status = 400;
    throw err;
  }

  const callRepository = AppDataSource.getRepository(Call);
  const leadRepository = AppDataSource.getRepository(Lead);

  const call = await callRepository.findOne({ where: { id: callId } });
  if (!call) {
    const err: any = new Error("Call not found");
    err.status = 404;
    throw err;
  }

  if (call.user_id && call.user_id !== user.id && user.role !== "admin") {
    const err: any = new Error("You can only wrap up your own calls");
    err.status = 403;
    throw err;
  }

  let lead: Lead | null = null;
  if (call.lead_id) {
    lead = await leadRepository.findOne({ where: { id: call.lead_id } });
    if (lead && !canAccessLead(lead, user)) {
      const err: any = new Error("You can only wrap up calls for leads assigned to you");
      err.status = 403;
      throw err;
    }
  }

  const outcome = input.outcome || CallOutcome.CONNECTED;
  const wasPendingWrapUp = !call.wrap_up_completed && needsCallWrapUp(call);

  call.outcome = outcome;
  call.notes = notes;
  if (input.duration_minutes != null) {
    call.duration_minutes = input.duration_minutes;
  }
  if (input.next_followup) {
    call.next_followup = new Date(input.next_followup);
  }
  call.wrap_up_completed = true;
  await callRepository.save(call);

  if (lead && wasPendingWrapUp) {
    await applyCallCompletion({
      lead,
      userId: call.user_id,
      userName: call.user_name,
      outcome,
      nextFollowup: call.next_followup,
      details: notes,
      incrementAttempt: false,
    });
    lead = await leadRepository.findOne({ where: { id: lead.id } });
  }

  if (lead && input.lead_status && input.lead_status !== lead.status) {
    if (STAGES_REQUIRING_REASON.includes(input.lead_status as Lead["status"]) && !input.closed_reason) {
      const err: any = new Error("Closed reason is required for this status");
      err.status = 400;
      err.rule = "closed_reason_required";
      throw err;
    }

    lead.status = input.lead_status as Lead["status"];
    lead.notes = notes;
    lead.last_activity = new Date();
    if (input.closed_reason) lead.closed_reason = input.closed_reason as Lead["closed_reason"];
    if (input.closed_reason_notes !== undefined) lead.closed_reason_notes = input.closed_reason_notes;
    if (input.next_followup) lead.next_followup = new Date(input.next_followup);
    await leadRepository.save(lead);
  } else if (lead && input.next_followup) {
    lead.next_followup = new Date(input.next_followup);
    await leadRepository.save(lead);
  }

  return { call, lead };
}
