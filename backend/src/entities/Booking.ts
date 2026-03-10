import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, BeforeInsert } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";
import { Lead } from "./Lead";

export enum PaymentStatus {
  UNPAID = "unpaid",
  PARTIAL = "partial",
  PAID = "paid",
}

@Entity("bookings")
export class Booking {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  lead_id: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  lead_name: string;

  @Column({ type: "varchar", length: 255 })
  hotel_name: string;

  @Column({ type: "date" })
  check_in: Date;

  @Column({ type: "date" })
  check_out: Date;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  final_price: number;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  bid_price: number | undefined;

  @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.UNPAID })
  payment_status: PaymentStatus;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  payment_amount: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  booking_reason: string;

  @Column({ type: "varchar", length: 36 })
  created_by_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Lead, (lead) => lead.bookings, { onDelete: "CASCADE" })
  @JoinColumn({ name: "lead_id" })
  lead: Lead;

  @ManyToOne(() => User, (user) => user.bookings, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
