import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Lead } from "../entities/Lead";
import { Call } from "../entities/Call";
import { Booking } from "../entities/Booking";
import { Activity } from "../entities/Activity";
import { MetaConfig } from "../entities/MetaConfig";
import { Payment } from "../entities/Payment";
import { Notification } from "../entities/Notification";
import { SavedFilter } from "../entities/SavedFilter";
import { PushSubscription } from "../entities/PushSubscription";
import dotenv from "dotenv";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "3306"),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  // Local empty DBs can set TYPEORM_SYNCHRONIZE=true once to create tables.
  synchronize: process.env.TYPEORM_SYNCHRONIZE === "true",
  // logging: true,
  entities: [User, Lead, Call, Booking, Activity, MetaConfig, Payment, Notification, SavedFilter, PushSubscription],
  migrations: [],
  subscribers: [],
  charset: "utf8mb4",
  extra: {
    charset: "utf8mb4_unicode_ci",
    connectionLimit: 10,
    connectTimeout: 60000, // 60 seconds
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  },
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log("Database connection established successfully");
    await ensureLeadQueryIndexes();
    await ensureTelephonySchema();
    await ensurePushSchema();
    await ensureSavedFiltersSchema();
  } catch (error) {
    console.error("Error connecting to database:", error);
    throw error;
  }
};

const isIgnorableSchemaError = (error: any): boolean => {
  const errno = error?.errno;
  const code = error?.code;
  // 1060 duplicate column, 1061 duplicate key, 1091 can't drop, 1068 multiple PK
  return errno === 1060 || errno === 1061 || errno === 1091 ||
    code === "ER_DUP_FIELDNAME" || code === "ER_DUP_KEYNAME";
};

const runSchemaSql = async (sql: string): Promise<void> => {
  try {
    await AppDataSource.query(sql);
  } catch (error: any) {
    if (!isIgnorableSchemaError(error)) {
      console.warn("Schema ensure skipped:", sql, error?.message || error);
    }
  }
};

/** Best-effort indexes for dashboard/export queries. synchronize is off, so these are applied here. */
const ensureLeadQueryIndexes = async (): Promise<void> => {
  await runSchemaSql("CREATE INDEX idx_leads_uncontacted ON leads (status, attempt_count, created_at)");
  await runSchemaSql("CREATE INDEX idx_leads_email ON leads (email)");
};

/** Tata telephony + phone_normalized columns. synchronize is off. */
const ensureTelephonySchema = async (): Promise<void> => {
  await runSchemaSql("ALTER TABLE users ADD COLUMN tata_extension VARCHAR(20) NULL");
  await runSchemaSql("ALTER TABLE leads ADD COLUMN phone_normalized VARCHAR(20) NULL");
  await runSchemaSql("CREATE INDEX idx_leads_phone_normalized ON leads (phone_normalized)");

  await runSchemaSql("ALTER TABLE calls ADD COLUMN tata_call_id VARCHAR(100) NULL");
  await runSchemaSql("ALTER TABLE calls ADD COLUMN recording_url TEXT NULL");
  await runSchemaSql("ALTER TABLE calls ADD COLUMN started_at DATETIME NULL");
  await runSchemaSql("ALTER TABLE calls ADD COLUMN answered_at DATETIME NULL");
  await runSchemaSql("ALTER TABLE calls ADD COLUMN ended_at DATETIME NULL");
  await runSchemaSql("ALTER TABLE calls ADD COLUMN direction VARCHAR(20) NULL");
  await runSchemaSql("ALTER TABLE calls ADD COLUMN customer_phone VARCHAR(50) NULL");
  await runSchemaSql("CREATE UNIQUE INDEX idx_calls_tata_call_id ON calls (tata_call_id)");

  await runSchemaSql("ALTER TABLE calls MODIFY COLUMN lead_id VARCHAR(36) NULL");
  await runSchemaSql("ALTER TABLE calls MODIFY COLUMN user_id VARCHAR(36) NULL");
  await runSchemaSql(
    "ALTER TABLE calls MODIFY COLUMN outcome ENUM('connected','no_answer','busy','voicemail','wrong_number','callback_requested') NULL"
  );

  await backfillPhoneNormalized();
};

const ensurePushSchema = async (): Promise<void> => {
  await runSchemaSql(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      endpoint VARCHAR(768) NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(512) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_push_subscriptions_endpoint (endpoint),
      INDEX idx_push_subscriptions_user_id (user_id),
      CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
};

const ensureSavedFiltersSchema = async (): Promise<void> => {
  await runSchemaSql(`
    CREATE TABLE IF NOT EXISTS saved_filters (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL,
      filter_json JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_saved_filters_user_id (user_id),
      CONSTRAINT fk_saved_filters_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
};

const backfillPhoneNormalized = async (): Promise<void> => {
  const { normalizePhone } = await import("../utils/phone");
  const leadRepository = AppDataSource.getRepository(Lead);

  const missing = await leadRepository
    .createQueryBuilder("lead")
    .select(["lead.id", "lead.phone", "lead.phone_normalized"])
    .where("lead.phone_normalized IS NULL OR lead.phone_normalized = ''")
    .getMany();

  if (missing.length === 0) return;

  const BATCH = 200;
  let updated = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await Promise.all(
      batch.map((lead) =>
        leadRepository.update({ id: lead.id }, { phone_normalized: normalizePhone(lead.phone) || null })
      )
    );
    updated += batch.length;
  }
  console.log(`Backfilled phone_normalized for ${updated} leads`);
};
