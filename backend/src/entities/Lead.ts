import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, BeforeInsert } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";
import { Call } from "./Call";
import { Booking } from "./Booking";

export enum LeadStatus {
  NEW = "new",
  NOT_ANSWERED = "not_answered",
  INTERESTED = "interested",
  NOT_INTERESTED = "not_interested",
  FOLLOWUP = "followup",
  WON = "won",
  LOST = "lost",
}

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

  @Column({ type: "enum", enum: LeadStatus, default: LeadStatus.NEW })
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
