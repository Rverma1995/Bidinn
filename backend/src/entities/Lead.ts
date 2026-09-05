import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, BeforeInsert, BeforeUpdate, Index } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";
import { Call } from "./Call";
import { Booking } from "./Booking";
import { normalizePhone } from "../utils/phone";

// Lead Stages matching frontend utils.ts
export enum LeadStatus {
  NEW = "new",
  NOT_ANSWERED = "not_answered",
  INTERESTED = "interested",
  NOT_INTERESTED = "not_interested",
  FOLLOWUP = "followup",
  WON = "won",
  LOST = "lost",
}

// Closed Lead Reasons
export enum ClosedReason {
  PRICE_TOO_HIGH = "price_too_high",
  BOOKED_ELSEWHERE = "booked_elsewhere",
  NOT_TRAVELLING = "not_travelling",
  NO_RESPONSE = "no_response",
  JUST_BROWSING = "just_browsing",
  WRONG_CONTACT = "wrong_contact",
  COMPETITOR = "competitor",
  BUDGET_ISSUES = "budget_issues",
  TIMING_NOT_RIGHT = "timing_not_right",
  OTHER = "other",
}

// Stage transition rules - Rule 5: Block direct transition from interested/followup to not_interested
export const STAGE_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.NEW]: [LeadStatus.NOT_ANSWERED, LeadStatus.INTERESTED, LeadStatus.NOT_INTERESTED, LeadStatus.FOLLOWUP, LeadStatus.WON, LeadStatus.LOST],
  [LeadStatus.NOT_ANSWERED]: [LeadStatus.NEW, LeadStatus.INTERESTED, LeadStatus.NOT_INTERESTED, LeadStatus.FOLLOWUP, LeadStatus.WON, LeadStatus.LOST],
  [LeadStatus.INTERESTED]: [LeadStatus.NEW, LeadStatus.NOT_ANSWERED, LeadStatus.FOLLOWUP, LeadStatus.WON, LeadStatus.LOST], // Cannot go directly to NOT_INTERESTED
  [LeadStatus.FOLLOWUP]: [LeadStatus.NEW, LeadStatus.NOT_ANSWERED, LeadStatus.INTERESTED, LeadStatus.WON, LeadStatus.LOST], // Cannot go directly to NOT_INTERESTED
  [LeadStatus.NOT_INTERESTED]: [LeadStatus.NEW], // Can reopen
  [LeadStatus.WON]: [], // Final stage
  [LeadStatus.LOST]: [LeadStatus.NEW], // Can reopen
};

// Rule 1: Stages that require assignment before transition
export const STAGES_REQUIRING_ASSIGNMENT: LeadStatus[] = [
  LeadStatus.NOT_ANSWERED,
  LeadStatus.INTERESTED,
  LeadStatus.FOLLOWUP,
];

// Rule 2: Stages that require closed reason
export const STAGES_REQUIRING_REASON: LeadStatus[] = [
  LeadStatus.NOT_INTERESTED,
  LeadStatus.LOST,
];

@Entity("leads")
@Index("idx_leads_assigned_to", ["assigned_to"])
@Index("idx_leads_status", ["status"])
@Index("idx_leads_created_at", ["created_at"])
@Index("idx_leads_phone", ["phone"])
@Index("idx_leads_phone_normalized", ["phone_normalized"])
@Index("idx_leads_source", ["source"])
@Index("idx_leads_assigned_status", ["assigned_to", "status"])
@Index("idx_leads_status_created", ["status", "created_at"])
@Index("idx_leads_next_followup", ["next_followup"])
@Index("idx_leads_attempt_count", ["attempt_count"])
@Index("idx_leads_campaign", ["campaign"])
@Index("idx_leads_uncontacted", ["status", "attempt_count", "created_at"])
@Index("idx_leads_email", ["email"])
export class Lead {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 50 })
  phone: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone_normalized: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  email: string;

  @Column({ type: "varchar", length: 100 })
  source: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  campaign: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  city: string;

  @Column({ type: "varchar", length: 50, default: LeadStatus.NEW })
  status: LeadStatus;

  @Column({ type: "varchar", length: 36, nullable: true })
  assigned_to: string | undefined;

  @Column({ type: "varchar", length: 255, nullable: true })
  assigned_name: string | undefined;

  @Column({ type: "int", default: 0 })
  attempt_count: number;

  @Column({ type: "datetime", nullable: true })
  last_activity: Date;

  @Column({ type: "datetime", nullable: true })
  next_followup: Date | undefined;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  meta_leadgen_id: string;

  // New field for closed reason
  @Column({ type: "varchar", length: 50, nullable: true })
  closed_reason: ClosedReason | undefined;

  @Column({ type: "text", nullable: true })
  closed_reason_notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, (user) => user.leads, { nullable: true })
  @JoinColumn({ name: "assigned_to" })
  assignedUser: User;

  @OneToMany(() => Call, (call) => call.lead)
  calls: Call[];

  @OneToMany(() => Booking, (booking) => booking.lead)
  bookings: Booking[];

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
    this.syncPhoneNormalized();
  }

  @BeforeUpdate()
  syncPhoneNormalized() {
    this.phone_normalized = this.phone ? normalizePhone(this.phone) || null : null;
  }
}
