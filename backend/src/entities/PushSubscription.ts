import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, BeforeInsert, Index } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";

@Entity("push_subscriptions")
@Index("idx_push_subscriptions_user_id", ["user_id"])
export class PushSubscription {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  user_id: string;

  @Column({ type: "varchar", length: 768, unique: true })
  endpoint: string;

  @Column({ type: "varchar", length: 255 })
  p256dh: string;

  @Column({ type: "varchar", length: 255 })
  auth: string;

  @Column({ type: "varchar", length: 512, nullable: true })
  user_agent: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

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
