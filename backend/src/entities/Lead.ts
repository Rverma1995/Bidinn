import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, BeforeInsert } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";
import { Call } from "./Call";
import { Booking } from "./Booking";

// Updated Lead Stages as per business rules
export enum LeadStatus {
  NEW = "new",
  CONTACTED = "contacted",
  FOLLOWUP_INTERESTED = "followup_interested",
  NOT_INTERESTED = "not_interested",
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
  OTHER = "other",
}

// Stage transition rules
export const STAGE_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.NEW]: [LeadStatus.CONTACTED, LeadStatus.NOT_INTERESTED, LeadStatus.LOST],
  [LeadStatus.CONTACTED]: [LeadStatus.FOLLOWUP_INTERESTED, LeadStatus.NOT_INTERESTED, LeadStatus.LOST],
  [LeadStatus.FOLLOWUP_INTERESTED]: [LeadStatus.WON, LeadStatus.LOST], // Cannot go to NOT_INTERESTED
  [LeadStatus.NOT_INTERESTED]: [LeadStatus.NEW], // Can reopen
  [LeadStatus.WON]: [], // Final stage
  [LeadStatus.LOST]: [LeadStatus.NEW], // Can reopen
};

// Stages that require assignment
export const STAGES_REQUIRING_ASSIGNMENT: LeadStatus[] = [
  LeadStatus.CONTACTED,
  LeadStatus.FOLLOWUP_INTERESTED,
];

// Stages that require closed reason
export const STAGES_REQUIRING_REASON: LeadStatus[] = [
  LeadStatus.NOT_INTERESTED,
  LeadStatus.LOST,
];

@Entity("leads")
export class Lead {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 50 })
  phone: string;

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
  }
}
