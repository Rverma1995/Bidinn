import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "../config/data-source";
import { Activity, CallOutcome, Lead } from "../entities";

/**
 * Shared post-call bookkeeping used by manual POST /api/calls and Tata webhooks.
 * Keeps attempt_count / last_activity / timeline activity in one place so dashboard
 * metrics stay accurate regardless of how the call was sourced.
 */
export async function applyCallCompletion(params: {
  lead: Lead;
  userId: string | null;
  userName: string;
  outcome: CallOutcome | string;
  nextFollowup?: Date;
  details?: string;
}): Promise<void> {
  const leadRepository = AppDataSource.getRepository(Lead);
  const activityRepository = AppDataSource.getRepository(Activity);

  params.lead.attempt_count = (params.lead.attempt_count || 0) + 1;
  params.lead.last_activity = new Date();
  if (params.nextFollowup) {
    params.lead.next_followup = params.nextFollowup;
  }
  await leadRepository.save(params.lead);

  const activity = activityRepository.create({
    id: uuidv4(),
    user_id: params.userId,
    user_name: params.userName,
    action: "logged_call",
    target_id: params.lead.id,
    target_type: "lead",
    target_name: params.lead.name,
    details: params.details || `Outcome: ${params.outcome}`,
  });
  await activityRepository.save(activity);
}
