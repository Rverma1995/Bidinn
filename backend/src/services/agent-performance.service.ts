import { In } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { Lead, LeadStatus, Booking, PaymentStatus, Call, User, UserRole } from "../entities";

const leadRepository = () => AppDataSource.getRepository(Lead);
const bookingRepository = () => AppDataSource.getRepository(Booking);
const callRepository = () => AppDataSource.getRepository(Call);
const userRepository = () => AppDataSource.getRepository(User);

export interface AgentPerformanceRow {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  agent_role: string;
  total_leads: number;
  contacted: number;
  not_contacted: number;
  converted: number;
  conversion_rate: number;
  calls_made: number;
  total_revenue: number;
  stage_new?: number;
  stage_not_answered?: number;
  stage_interested?: number;
  stage_followup?: number;
  stage_won?: number;
  stage_lost?: number;
  stage_not_interested?: number;
}

export interface AgentPerformanceResult {
  agents: AgentPerformanceRow[];
  team_summary: {
    total_leads: number;
    contacted: number;
    not_contacted: number;
    converted: number;
    total_revenue: number;
  };
  all_agents: { id: string; name: string; role: string }[];
}

export interface AgentPerformanceQuery {
  agentId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Same aggregation as GET /dashboard/agent-performance.
 * Date filters apply to lead.created_at, call.created_at, and booking.created_at.
 */
export async function getAgentPerformance(query: AgentPerformanceQuery = {}): Promise<AgentPerformanceResult> {
  const { agentId, startDate, endDate } = query;

  const allAgents = await userRepository().find({
    where: { role: In([UserRole.SALES_REP, UserRole.TEAM_LEAD, UserRole.MANAGER]) },
  });

  const adminUsers = await userRepository().find({
    where: { role: UserRole.ADMIN },
  });
  const adminIds = adminUsers.map((a) => a.id);

  const usersToProcess =
    agentId && agentId !== "all" && agentId !== "system"
      ? allAgents.filter((u) => u.id === agentId)
      : allAgents;

  const agents = await Promise.all(
    usersToProcess.map(async (user) => {
      let leadsQuery = leadRepository().createQueryBuilder("lead").where("lead.assigned_to = :userId", { userId: user.id });

      if (startDate) {
        leadsQuery = leadsQuery.andWhere("lead.created_at >= :start", { start: startDate });
      }
      if (endDate) {
        leadsQuery = leadsQuery.andWhere("lead.created_at <= :end", { end: endDate });
      }

      const totalLeads = await leadsQuery.getCount();

      const contacted = await leadsQuery.clone()
        .andWhere("lead.status != :newStatus", { newStatus: LeadStatus.NEW })
        .getCount();

      const notContacted = totalLeads - contacted;

      const converted = await leadsQuery.clone()
        .andWhere("lead.status = :wonStatus", { wonStatus: LeadStatus.WON })
        .getCount();

      const stageNew = await leadsQuery.clone()
        .andWhere("lead.status = :status", { status: LeadStatus.NEW })
        .getCount();
      const stageNotAnswered = await leadsQuery.clone()
        .andWhere("lead.status = :status", { status: LeadStatus.NOT_ANSWERED })
        .getCount();
      const stageInterested = await leadsQuery.clone()
        .andWhere("lead.status = :status", { status: LeadStatus.INTERESTED })
        .getCount();
      const stageFollowup = await leadsQuery.clone()
        .andWhere("lead.status = :status", { status: LeadStatus.FOLLOWUP })
        .getCount();
      const stageWon = converted;
      const stageLost = await leadsQuery.clone()
        .andWhere("lead.status = :status", { status: LeadStatus.LOST })
        .getCount();
      const stageNotInterested = await leadsQuery.clone()
        .andWhere("lead.status = :status", { status: LeadStatus.NOT_INTERESTED })
        .getCount();

      let callsQuery = callRepository().createQueryBuilder("call").where("call.user_id = :userId", { userId: user.id });
      if (startDate) {
        callsQuery = callsQuery.andWhere("call.created_at >= :start", { start: startDate });
      }
      if (endDate) {
        callsQuery = callsQuery.andWhere("call.created_at <= :end", { end: endDate });
      }
      const callsMade = await callsQuery.getCount();

      let bookingsQuery = bookingRepository().createQueryBuilder("booking").where("booking.created_by_id = :userId", { userId: user.id });
      if (startDate) {
        bookingsQuery = bookingsQuery.andWhere("booking.created_at >= :start", { start: startDate });
      }
      if (endDate) {
        bookingsQuery = bookingsQuery.andWhere("booking.created_at <= :end", { end: endDate });
      }

      const revenueResult = await bookingsQuery
        .select("SUM(booking.payment_amount)", "total")
        .andWhere("booking.payment_status IN (:...statuses)", { statuses: [PaymentStatus.PAID, PaymentStatus.PARTIAL] })
        .getRawOne();

      const totalRevenue = parseFloat(revenueResult?.total || "0");
      const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

      return {
        agent_id: user.id,
        agent_name: user.name,
        agent_email: user.email,
        agent_role: user.role,
        total_leads: totalLeads,
        contacted,
        not_contacted: notContacted,
        converted,
        conversion_rate: conversionRate,
        calls_made: callsMade,
        total_revenue: totalRevenue,
        stage_new: stageNew,
        stage_not_answered: stageNotAnswered,
        stage_interested: stageInterested,
        stage_followup: stageFollowup,
        stage_won: stageWon,
        stage_lost: stageLost,
        stage_not_interested: stageNotInterested,
      };
    })
  );

  let systemLeadsQuery = leadRepository().createQueryBuilder("lead")
    .where("(lead.assigned_to IS NULL OR lead.assigned_to IN (:...adminIds) OR lead.assigned_name = :defaultName)",
      { adminIds: adminIds.length > 0 ? adminIds : ["no-admin"], defaultName: "Default" });

  if (startDate) {
    systemLeadsQuery = systemLeadsQuery.andWhere("lead.created_at >= :start", { start: startDate });
  }
  if (endDate) {
    systemLeadsQuery = systemLeadsQuery.andWhere("lead.created_at <= :end", { end: endDate });
  }

  const systemTotalLeads = await systemLeadsQuery.getCount();
  const systemContacted = await systemLeadsQuery.clone()
    .andWhere("lead.status != :newStatus", { newStatus: LeadStatus.NEW })
    .getCount();
  const systemNotContacted = systemTotalLeads - systemContacted;
  const systemConverted = await systemLeadsQuery.clone()
    .andWhere("lead.status = :wonStatus", { wonStatus: LeadStatus.WON })
    .getCount();
  const systemConversionRate = systemTotalLeads > 0 ? Math.round((systemConverted / systemTotalLeads) * 100) : 0;

  const systemAgent: AgentPerformanceRow = {
    agent_id: "system",
    agent_name: "System (Unassigned/Admin)",
    agent_email: "system@bidinn.com",
    agent_role: "system",
    total_leads: systemTotalLeads,
    contacted: systemContacted,
    not_contacted: systemNotContacted,
    converted: systemConverted,
    conversion_rate: systemConversionRate,
    calls_made: 0,
    total_revenue: 0,
  };

  const allAgentsWithSystem =
    agentId === "system"
      ? [systemAgent]
      : agentId && agentId !== "all"
        ? agents
        : [...agents, systemAgent];

  const teamSummary = {
    total_leads: agents.reduce((sum, a) => sum + a.total_leads, 0) + systemTotalLeads,
    contacted: agents.reduce((sum, a) => sum + a.contacted, 0) + systemContacted,
    not_contacted: agents.reduce((sum, a) => sum + a.not_contacted, 0) + systemNotContacted,
    converted: agents.reduce((sum, a) => sum + a.converted, 0) + systemConverted,
    total_revenue: agents.reduce((sum, a) => sum + a.total_revenue, 0),
  };

  return {
    agents: allAgentsWithSystem,
    team_summary: teamSummary,
    all_agents: [
      ...allAgents.map((a) => ({ id: a.id, name: a.name, role: a.role })),
      { id: "system", name: "System (Unassigned/Admin)", role: "system" },
    ],
  };
}
