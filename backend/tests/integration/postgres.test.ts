import "reflect-metadata";
import assert from "assert";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { buildPostgresOptions, AppDataSource } from "../../src/data-source";
import {
  User,
  UserRole,
  Lead,
  LeadStatus,
  Call,
  CallOutcome,
  Booking,
  PaymentStatus,
  Payment,
  Activity,
  Notification,
  NotificationType,
  NotificationPriority,
  SavedFilter,
  PushSubscription,
  MetaConfig,
} from "../../src/entities";
import { applyLeadListFilters } from "../../src/utils/lead-scope";

function test(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve(fn()).then(
    () => console.log(`PASS: ${name}`),
    (error) => {
      console.error(`FAIL: ${name}`);
      throw error;
    }
  );
}

async function main() {
  console.log("=== Running PostgreSQL Integration Tests ===");

  const ds = new DataSource(buildPostgresOptions());
  await ds.initialize();
  console.log("PASS: PostgreSQL DataSource initialized and pool active");

  const testUserEmail = `pg_test_${Date.now()}@bidinn.com`;
  let testUserId = "";
  let testLeadId = "";
  let testBookingId = "";

  try {
    // 1. User CRUD
    await test("PostgreSQL: User entity CRUD", async () => {
      const userRepo = ds.getRepository(User);
      const user = userRepo.create({
        id: uuidv4(),
        email: testUserEmail,
        name: "PostgreSQL Integration Tester",
        password_hash: "hash123",
        role: UserRole.SALES_REP,
        is_active: true,
        tata_extension: "101",
      });
      await userRepo.save(user);
      testUserId = user.id;

      const fetched = await userRepo.findOneBy({ id: testUserId });
      assert.ok(fetched, "User should be found");
      assert.strictEqual(fetched.email, testUserEmail);
      assert.strictEqual(fetched.role, UserRole.SALES_REP);
      assert.strictEqual(fetched.is_active, true);

      // Update
      fetched.name = "PostgreSQL Updated Tester";
      await userRepo.save(fetched);
      const updated = await userRepo.findOneBy({ id: testUserId });
      assert.strictEqual(updated?.name, "PostgreSQL Updated Tester");
    });

    // 2. Lead CRUD & phone normalization hook
    await test("PostgreSQL: Lead CRUD and phone_normalized hook", async () => {
      const leadRepo = ds.getRepository(Lead);
      const lead = leadRepo.create({
        id: uuidv4(),
        name: "Test Lead Postgres",
        phone: "+91 98765 43210",
        email: "lead.test@bidinn.com",
        source: "Website",
        campaign: "Dubai Tour",
        city: "Mumbai",
        status: LeadStatus.NEW,
        assigned_to: testUserId,
        attempt_count: 0,
      });
      await leadRepo.save(lead);
      testLeadId = lead.id;

      const fetched = await leadRepo.findOne({
        where: { id: testLeadId },
        relations: ["assignedUser"],
      });
      assert.ok(fetched, "Lead should be found");
      assert.strictEqual(fetched.phone_normalized, "9876543210");
      assert.strictEqual(fetched.assignedUser?.id, testUserId);
      assert.strictEqual(fetched.status, LeadStatus.NEW);
    });

    // 3. ILIKE Case-Insensitive Search
    await test("PostgreSQL: Case-insensitive search using ILIKE", async () => {
      const leadRepo = ds.getRepository(Lead);
      const qb = leadRepo.createQueryBuilder("lead");
      applyLeadListFilters(qb, { search: "test lead postgres" });
      const results = await qb.getMany();
      assert.ok(results.some((l) => l.id === testLeadId), "ILIKE search should find lead case-insensitively");
    });

    // 4. Booking & Decimal precision
    await test("PostgreSQL: Booking creation and decimal handling", async () => {
      const bookingRepo = ds.getRepository(Booking);
      const booking = bookingRepo.create({
        id: uuidv4(),
        lead_id: testLeadId,
        lead_name: "Test Lead Postgres",
        hotel_name: "Burj Al Arab",
        check_in: new Date("2026-11-01"),
        check_out: new Date("2026-11-05"),
        final_price: 150000.5,
        bid_price: 145000.0,
        payment_status: PaymentStatus.PARTIAL,
        payment_amount: 50000.25,
        created_by_id: testUserId,
      });
      await bookingRepo.save(booking);
      testBookingId = booking.id;

      const fetched = await bookingRepo.findOneBy({ id: testBookingId });
      assert.ok(fetched, "Booking should be found");
      assert.strictEqual(Number(fetched.final_price), 150000.5);
      assert.strictEqual(Number(fetched.payment_amount), 50000.25);
    });

    // 5. Payment relation
    await test("PostgreSQL: Payment creation with Booking cascade relation", async () => {
      const paymentRepo = ds.getRepository(Payment);
      const payment = paymentRepo.create({
        id: uuidv4(),
        booking_id: testBookingId,
        amount: 25000.0,
        notes: "Second installment",
        created_by: testUserId,
      });
      await paymentRepo.save(payment);

      const fetched = await paymentRepo.findOne({
        where: { id: payment.id },
        relations: ["booking"],
      });
      assert.ok(fetched, "Payment should be found");
      assert.strictEqual(fetched.booking?.id, testBookingId);
    });

    // 6. JSON column storage in Notification and SavedFilter
    await test("PostgreSQL: JSON column storage and retrieval", async () => {
      const notifRepo = ds.getRepository(Notification);
      const notif = notifRepo.create({
        id: uuidv4(),
        user_id: testUserId,
        type: NotificationType.LEAD_ASSIGNMENT,
        priority: NotificationPriority.HIGH,
        title: "Test Notification",
        message: "You have been assigned a lead",
        metadata: { lead_id: testLeadId, tags: ["vip", "urgent"], score: 98 },
        is_read: false,
      });
      await notifRepo.save(notif);

      const fetched = await notifRepo.findOneBy({ id: notif.id });
      assert.ok(fetched, "Notification should be found");
      assert.strictEqual(fetched.metadata?.score, 98);
      assert.deepStrictEqual(fetched.metadata?.tags, ["vip", "urgent"]);
      assert.strictEqual(fetched.is_read, false);
    });

    // 7. Transaction rollback
    await test("PostgreSQL: Transaction rollback on failure", async () => {
      const leadRepo = ds.getRepository(Lead);
      const rolledBackLeadId = uuidv4();

      try {
        await ds.transaction(async (manager) => {
          const orphan = manager.create(Lead, {
            id: rolledBackLeadId,
            name: "Should Roll Back",
            phone: "+91 99999 88888",
            source: "Test",
            status: LeadStatus.NEW,
            assigned_to: testUserId,
          });
          await manager.save(orphan);

          // Force failure
          throw new Error("Intentional rollback test");
        });
      } catch (err: any) {
        assert.strictEqual(err.message, "Intentional rollback test");
      }

      const notFound = await leadRepo.findOneBy({ id: rolledBackLeadId });
      assert.strictEqual(notFound, null, "Transaction rollback should ensure record was not inserted");
    });
  } finally {
    // Cleanup fixtures
    try {
      if (testBookingId) {
        await ds.getRepository(Payment).delete({ booking_id: testBookingId });
        await ds.getRepository(Booking).delete({ id: testBookingId });
      }
      if (testLeadId) {
        await ds.getRepository(Lead).delete({ id: testLeadId });
      }
      if (testUserId) {
        await ds.getRepository(Notification).delete({ user_id: testUserId });
        await ds.getRepository(User).delete({ id: testUserId });
      }
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr);
    }
    await ds.destroy();
  }

  console.log("All PostgreSQL integration tests passed!");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("PostgreSQL integration test failed:", err);
    process.exit(1);
  });
}
