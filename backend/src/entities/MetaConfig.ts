import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert } from "typeorm";
import { v4 as uuidv4 } from "uuid";

@Entity("meta_config")
export class MetaConfig {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  page_id: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  app_secret: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  verify_token: string;

  @Column({ type: "text", nullable: true })
  page_access_token: string;

  @Column({ type: "boolean", default: false })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
