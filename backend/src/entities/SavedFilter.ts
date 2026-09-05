import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, BeforeInsert, Index } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";
import type { LeadFilterState } from "../utils/saved-filters";

@Entity("saved_filters")
@Index("idx_saved_filters_user_id", ["user_id"])
export class SavedFilter {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  user_id: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "json" })
  filter_json: LeadFilterState;

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
