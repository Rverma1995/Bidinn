import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, BeforeInsert } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";

@Entity("activities")
export class Activity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  user_id: string;

  @Column({ type: "varchar", length: 255 })
  user_name: string;

  @Column({ type: "varchar", length: 100 })
  action: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  target_id: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  target_type: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  target_name: string;

  @Column({ type: "text", nullable: true })
  details: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, (user) => user.activities, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
