import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, BeforeInsert } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { Booking } from "./Booking";
import { User } from "./User";

@Entity("payments")
export class Payment {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  booking_id: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "varchar", length: 36 })
  created_by: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Booking, { onDelete: "CASCADE" })
  @JoinColumn({ name: "booking_id" })
  booking: Booking;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by" })
  creator: User;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
