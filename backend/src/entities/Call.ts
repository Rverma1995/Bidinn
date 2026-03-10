import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, BeforeInsert } from "typeorm";
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

@Entity("calls")
export class Call {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  lead_id: string;

  @Column({ type: "varchar", length: 36 })
  user_id: string;

  @Column({ type: "varchar", length: 255 })
  user_name: string;

  @Column({ type: "enum", enum: CallOutcome })
  outcome: CallOutcome;

  @Column({ type: "int", default: 0 })
  duration_minutes: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "datetime", nullable: true })
  next_followup: Date;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Lead, (lead) => lead.calls, { onDelete: "CASCADE" })
  @JoinColumn({ name: "lead_id" })
  lead: Lead;

  @ManyToOne(() => User, (user) => user.calls, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
