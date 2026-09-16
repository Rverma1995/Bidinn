import { MigrationInterface, QueryRunner } from "typeorm";
import {
  addColumnIfNotExists,
  addForeignKeyIfNotExists,
  createIndexIfNotExists,
  indexExists,
  tableExists,
} from "./helpers";

/**
 * Production-safe schema sync. All operations are additive/idempotent — no DROP statements.
 */
export class Prod1789474844325 implements MigrationInterface {
  name = "Prod1789474844325";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, "saved_filters"))) {
      await queryRunner.query(`
        CREATE TABLE \`saved_filters\` (
          \`id\` varchar(36) NOT NULL,
          \`user_id\` varchar(36) NOT NULL,
          \`name\` varchar(100) NOT NULL,
          \`filter_json\` json NOT NULL,
          \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX \`idx_saved_filters_user_id\` (\`user_id\`),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
    } else {
      await createIndexIfNotExists(
        queryRunner,
        "saved_filters",
        "idx_saved_filters_user_id",
        "`user_id`"
      );
    }

    if (!(await tableExists(queryRunner, "push_subscriptions"))) {
      await queryRunner.query(`
        CREATE TABLE \`push_subscriptions\` (
          \`id\` varchar(36) NOT NULL,
          \`user_id\` varchar(36) NOT NULL,
          \`endpoint\` varchar(768) NOT NULL,
          \`p256dh\` varchar(255) NOT NULL,
          \`auth\` varchar(255) NOT NULL,
          \`user_agent\` varchar(512) NULL,
          \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX \`idx_push_subscriptions_user_id\` (\`user_id\`),
          UNIQUE INDEX \`IDX_0008bdfd174e533a3f98bf9af1\` (\`endpoint\`),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
    } else {
      await createIndexIfNotExists(
        queryRunner,
        "push_subscriptions",
        "idx_push_subscriptions_user_id",
        "`user_id`"
      );
      await createIndexIfNotExists(
        queryRunner,
        "push_subscriptions",
        "IDX_0008bdfd174e533a3f98bf9af1",
        "`endpoint`",
        true
      );
    }

    await addColumnIfNotExists(
      queryRunner,
      "calls",
      "wrap_up_completed",
      "TINYINT(1) NOT NULL DEFAULT 0"
    );

    await createIndexIfNotExists(queryRunner, "calls", "idx_calls_created_at", "`created_at`");
    await createIndexIfNotExists(queryRunner, "calls", "idx_calls_user_id", "`user_id`");

    if (
      !(await indexExists(queryRunner, "bookings", "idx_bookings_created_by_id")) &&
      !(await indexExists(queryRunner, "bookings", "idx_bookings_created_by"))
    ) {
      await createIndexIfNotExists(
        queryRunner,
        "bookings",
        "idx_bookings_created_by_id",
        "`created_by_id`"
      );
    }

    await createIndexIfNotExists(queryRunner, "leads", "idx_leads_attempt_count", "`attempt_count`");
    await createIndexIfNotExists(queryRunner, "leads", "idx_leads_next_followup", "`next_followup`");
    await createIndexIfNotExists(queryRunner, "activities", "idx_activities_created_at", "`created_at`");
    await createIndexIfNotExists(queryRunner, "users", "idx_users_role", "`role`");
    await createIndexIfNotExists(queryRunner, "notifications", "idx_notifications_is_read", "`is_read`");
    await createIndexIfNotExists(queryRunner, "notifications", "idx_notifications_user_id", "`user_id`");

    await addForeignKeyIfNotExists(
      queryRunner,
      "saved_filters",
      "FK_1072cc58f972749123491fcd776",
      "user_id",
      "users",
      "id"
    );
    await addForeignKeyIfNotExists(
      queryRunner,
      "push_subscriptions",
      "FK_6771f119f1c06d2ccf38f238664",
      "user_id",
      "users",
      "id"
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally empty — use a database backup to roll back production changes.
  }
}
