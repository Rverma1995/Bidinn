import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, BeforeInsert } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";

export enum NotificationType {
  IDLE_LEAD = "idle_lead",
  DUPLICATE_LEAD = "duplicate_lead",
  LEAD_MERGED = "lead_merged",
  LEAD_ASSIGNMENT = "lead_assignment",
  SYSTEM = "system",
}

export enum NotificationPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

@Entity("notifications")
export class Notification {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  user_id: string;

  @Column({ type: "varchar", length: 100 })
  type: NotificationType;

  @Column({ type: "varchar", length: 50, default: NotificationPriority.MEDIUM })
  priority: NotificationPriority;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text" })
  message: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  target_id: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  target_type: string;

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @Column({ type: "boolean", default: false })
  is_read: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
