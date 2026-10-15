import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialPostgresSchema1792043551533 implements MigrationInterface {
    name = 'InitialPostgresSchema1792043551533'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."calls_outcome_enum" AS ENUM('connected', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'callback_requested')`);
        await queryRunner.query(`CREATE TABLE "calls" ("id" character varying(36) NOT NULL, "lead_id" character varying(36), "user_id" character varying(36), "user_name" character varying(255) NOT NULL, "outcome" "public"."calls_outcome_enum", "duration_minutes" integer NOT NULL DEFAULT '0', "notes" text, "next_followup" TIMESTAMP, "tata_call_id" character varying(100), "direction" character varying(20), "recording_url" text, "started_at" TIMESTAMP, "answered_at" TIMESTAMP, "ended_at" TIMESTAMP, "customer_phone" character varying(50), "wrap_up_completed" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d9171d91f8dd1a649659f1b6a20" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_calls_tata_call_id" ON "calls" ("tata_call_id") `);
        await queryRunner.query(`CREATE INDEX "idx_calls_created_at" ON "calls" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_calls_user_id" ON "calls" ("user_id") `);
        await queryRunner.query(`CREATE TYPE "public"."bookings_payment_status_enum" AS ENUM('unpaid', 'partial', 'paid')`);
        await queryRunner.query(`CREATE TABLE "bookings" ("id" character varying(36) NOT NULL, "lead_id" character varying(36) NOT NULL, "lead_name" character varying(255), "hotel_name" character varying(255) NOT NULL, "check_in" date NOT NULL, "check_out" date NOT NULL, "final_price" numeric(10,2) NOT NULL, "bid_price" numeric(10,2), "payment_status" "public"."bookings_payment_status_enum" NOT NULL DEFAULT 'unpaid', "payment_amount" numeric(10,2) NOT NULL DEFAULT '0', "notes" text, "booking_reason" character varying(255), "created_by_id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_bookings_created_by_id" ON "bookings" ("created_by_id") `);
        await queryRunner.query(`CREATE INDEX "idx_bookings_created_at" ON "bookings" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_bookings_payment_status" ON "bookings" ("payment_status") `);
        await queryRunner.query(`CREATE INDEX "idx_bookings_lead_id" ON "bookings" ("lead_id") `);
        await queryRunner.query(`CREATE TABLE "leads" ("id" character varying(36) NOT NULL, "name" character varying(255) NOT NULL, "phone" character varying(50) NOT NULL, "phone_normalized" character varying(20), "email" character varying(255), "source" character varying(100) NOT NULL, "campaign" character varying(255), "city" character varying(100), "status" character varying(50) NOT NULL DEFAULT 'new', "assigned_to" character varying(36), "assigned_name" character varying(255), "attempt_count" integer NOT NULL DEFAULT '0', "last_activity" TIMESTAMP, "next_followup" TIMESTAMP, "notes" text, "meta_leadgen_id" character varying(255), "closed_reason" character varying(50), "closed_reason_notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cd102ed7a9a4ca7d4d8bfeba406" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_leads_email" ON "leads" ("email") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_uncontacted" ON "leads" ("status", "attempt_count", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_campaign" ON "leads" ("campaign") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_attempt_count" ON "leads" ("attempt_count") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_next_followup" ON "leads" ("next_followup") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_status_created" ON "leads" ("status", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_assigned_status" ON "leads" ("assigned_to", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_source" ON "leads" ("source") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_phone_normalized" ON "leads" ("phone_normalized") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_phone" ON "leads" ("phone") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_created_at" ON "leads" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_status" ON "leads" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_assigned_to" ON "leads" ("assigned_to") `);
        await queryRunner.query(`CREATE TABLE "activities" ("id" character varying(36) NOT NULL, "user_id" character varying(36), "user_name" character varying(255) NOT NULL, "action" character varying(100) NOT NULL, "target_id" character varying(36), "target_type" character varying(50), "target_name" character varying(255), "details" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7f4004429f731ffb9c88eb486a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_activities_created_at" ON "activities" ("created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'manager', 'team_lead', 'sales_rep')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" character varying(36) NOT NULL, "email" character varying(255) NOT NULL, "name" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'sales_rep', "is_active" boolean NOT NULL DEFAULT true, "tata_extension" character varying(20), "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_users_role" ON "users" ("role") `);
        await queryRunner.query(`CREATE TABLE "meta_config" ("id" character varying(36) NOT NULL, "page_id" character varying(255), "app_secret" character varying(255), "verify_token" character varying(255), "page_access_token" text, "is_active" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cc0c9cb796cac63f3c6311c974f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" character varying(36) NOT NULL, "booking_id" character varying(36) NOT NULL, "amount" numeric(10,2) NOT NULL, "notes" text, "created_by" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_payments_created_by" ON "payments" ("created_by") `);
        await queryRunner.query(`CREATE INDEX "idx_payments_created_at" ON "payments" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_payments_booking_id" ON "payments" ("booking_id") `);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" character varying(36) NOT NULL, "user_id" character varying(36) NOT NULL, "type" character varying(100) NOT NULL, "priority" character varying(50) NOT NULL DEFAULT 'medium', "title" character varying(255) NOT NULL, "message" text NOT NULL, "target_id" character varying(36), "target_type" character varying(50), "metadata" json, "is_read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_notifications_is_read" ON "notifications" ("is_read") `);
        await queryRunner.query(`CREATE INDEX "idx_notifications_user_id" ON "notifications" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "saved_filters" ("id" character varying(36) NOT NULL, "user_id" character varying(36) NOT NULL, "name" character varying(100) NOT NULL, "filter_json" json NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d30e30ca883a3bd014c9ed983ac" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_saved_filters_user_id" ON "saved_filters" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "push_subscriptions" ("id" character varying(36) NOT NULL, "user_id" character varying(36) NOT NULL, "endpoint" character varying(768) NOT NULL, "p256dh" character varying(255) NOT NULL, "auth" character varying(255) NOT NULL, "user_agent" character varying(512), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_0008bdfd174e533a3f98bf9af16" UNIQUE ("endpoint"), CONSTRAINT "PK_757fc8f00c34f66832668dc2e53" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_push_subscriptions_user_id" ON "push_subscriptions" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "calls" ADD CONSTRAINT "FK_b9587542bab25201aa49e5c91e1" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "calls" ADD CONSTRAINT "FK_89355642b825e0d40dd39184b09" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_a2fe3ad16c3dbafe7c00e9f2c4a" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_2ab7f927262f1f56d6f45bca107" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "leads" ADD CONSTRAINT "FK_5c37aa54e3b06f6733d56007e0c" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activities" ADD CONSTRAINT "FK_b82f1d8368dd5305ae7e7e664c2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_e86edf76dc2424f123b9023a2b2" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_2b505576ec68c4d47782a51a832" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "saved_filters" ADD CONSTRAINT "FK_1072cc58f972749123491fcd776" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD CONSTRAINT "FK_6771f119f1c06d2ccf38f238664" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP CONSTRAINT "FK_6771f119f1c06d2ccf38f238664"`);
        await queryRunner.query(`ALTER TABLE "saved_filters" DROP CONSTRAINT "FK_1072cc58f972749123491fcd776"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_2b505576ec68c4d47782a51a832"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_e86edf76dc2424f123b9023a2b2"`);
        await queryRunner.query(`ALTER TABLE "activities" DROP CONSTRAINT "FK_b82f1d8368dd5305ae7e7e664c2"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_5c37aa54e3b06f6733d56007e0c"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_2ab7f927262f1f56d6f45bca107"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_a2fe3ad16c3dbafe7c00e9f2c4a"`);
        await queryRunner.query(`ALTER TABLE "calls" DROP CONSTRAINT "FK_89355642b825e0d40dd39184b09"`);
        await queryRunner.query(`ALTER TABLE "calls" DROP CONSTRAINT "FK_b9587542bab25201aa49e5c91e1"`);
        await queryRunner.query(`DROP INDEX "public"."idx_push_subscriptions_user_id"`);
        await queryRunner.query(`DROP TABLE "push_subscriptions"`);
        await queryRunner.query(`DROP INDEX "public"."idx_saved_filters_user_id"`);
        await queryRunner.query(`DROP TABLE "saved_filters"`);
        await queryRunner.query(`DROP INDEX "public"."idx_notifications_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_notifications_is_read"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payments_booking_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payments_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payments_created_by"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TABLE "meta_config"`);
        await queryRunner.query(`DROP INDEX "public"."idx_users_role"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_activities_created_at"`);
        await queryRunner.query(`DROP TABLE "activities"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_assigned_to"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_phone"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_phone_normalized"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_source"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_assigned_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_status_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_next_followup"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_attempt_count"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_campaign"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_uncontacted"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_email"`);
        await queryRunner.query(`DROP TABLE "leads"`);
        await queryRunner.query(`DROP INDEX "public"."idx_bookings_lead_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_bookings_payment_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_bookings_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_bookings_created_by_id"`);
        await queryRunner.query(`DROP TABLE "bookings"`);
        await queryRunner.query(`DROP TYPE "public"."bookings_payment_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_calls_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_calls_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_calls_tata_call_id"`);
        await queryRunner.query(`DROP TABLE "calls"`);
        await queryRunner.query(`DROP TYPE "public"."calls_outcome_enum"`);
    }

}
