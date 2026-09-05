import { Entity, PrimaryColumn, Column, CreateDateColumn, OneToMany, BeforeInsert, Index } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { Lead } from "./Lead";
import { Call } from "./Call";
import { Booking } from "./Booking";
import { Activity } from "./Activity";

export enum UserRole {
  ADMIN = "admin",
  MANAGER = "manager",
  TEAM_LEAD = "team_lead",
  SALES_REP = "sales_rep",
}

@Entity("users")
@Index("idx_users_role", ["role"])
export class User {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 255, unique: true })
  email: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 255 })
  password_hash: string;

  @Column({ type: "enum", enum: UserRole, default: UserRole.SALES_REP })
  role: UserRole;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @Column({ type: "varchar", length: 20, nullable: true })
  tata_extension: string | null;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Lead, (lead) => lead.assignedUser)
  leads: Lead[];

  @OneToMany(() => Call, (call) => call.user)
  calls: Call[];

  @OneToMany(() => Booking, (booking) => booking.createdBy)
  bookings: Booking[];

  @OneToMany(() => Activity, (activity) => activity.user)
  activities: Activity[];

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
