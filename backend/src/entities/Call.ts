import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, BeforeInsert, Index } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";
import { Lead } from "./Lead";

export enum CallOutcome {
  CONNECTED = "connected",
  NO_ANSWER = "no_answer",
  BUSY = "busy",
  VOICEMAIL = "voicemail",
  WRONG_NUMBER = "wrong_number",
  CALLBACK_REQUESTED = "callback_requested",
}

export enum CallDirection {
  INBOUND = "inbound",
  OUTBOUND = "outbound",
}

@Entity("calls")
@Index("idx_calls_user_id", ["user_id"])
@Index("idx_calls_created_at", ["created_at"])
@Index("idx_calls_tata_call_id", ["tata_call_id"], { unique: true })
export class Call {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  lead_id: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  user_id: string | null;

  @Column({ type: "varchar", length: 255 })
  user_name: string;

  @Column({ type: "enum", enum: CallOutcome, nullable: true })
  outcome: CallOutcome | null;

  @Column({ type: "int", default: 0 })
  duration_minutes: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "datetime", nullable: true })
  next_followup: Date | undefined;

  @Column({ type: "varchar", length: 100, nullable: true })
  tata_call_id: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  direction: CallDirection | null;

  @Column({ type: "text", nullable: true })
  recording_url: string | null;

  @Column({ type: "datetime", nullable: true })
  started_at: Date | null;

  @Column({ type: "datetime", nullable: true })
  answered_at: Date | null;

  @Column({ type: "datetime", nullable: true })
  ended_at: Date | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  customer_phone: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Lead, (lead) => lead.calls, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "lead_id" })
  lead: Lead | null;

  @ManyToOne(() => User, (user) => user.calls, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "user_id" })
  user: User | null;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
