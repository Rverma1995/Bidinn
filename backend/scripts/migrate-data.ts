import mysql from "mysql2/promise";
import { Pool, PoolClient } from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface TableMigrationConfig {
  name: string;
  columns: string[];
  conflictKey: string;
  transform: (row: any) => any[];
  batchSize: number;
}

function parseJsonSafe(val: any): any {
  if (val == null) return null;
  if (typeof val === "object") return JSON.stringify(val);
  if (typeof val === "string") {
    try {
      JSON.parse(val);
      return val;
    } catch {
      return JSON.stringify(val);
    }
  }
  return JSON.stringify(val);
}

function toBoolean(val: any, defaultVal = false): boolean {
  if (val === null || val === undefined) return defaultVal;
  return val === 1 || val === true || val === "1" || val === "true";
}

function toDate(val: any): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNullableString(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

const TABLE_CONFIGS: TableMigrationConfig[] = [
  {
    name: "users",
    columns: ["id", "email", "name", "password_hash", "role", "is_active", "tata_extension", "created_at"],
    conflictKey: "id",
    batchSize: 1000,
    transform: (r) => [
      r.id,
      r.email ? r.email.trim().toLowerCase() : r.email,
      r.name,
      r.password_hash,
      r.role,
      toBoolean(r.is_active, true),
      toNullableString(r.tata_extension),
      toDate(r.created_at) || new Date(),
    ],
  },
  {
    name: "meta_config",
    columns: ["id", "page_id", "app_secret", "verify_token", "page_access_token", "is_active", "created_at", "updated_at"],
    conflictKey: "id",
    batchSize: 100,
    transform: (r) => [
      r.id,
      toNullableString(r.page_id),
      toNullableString(r.app_secret),
      toNullableString(r.verify_token),
      toNullableString(r.page_access_token),
      toBoolean(r.is_active, false),
      toDate(r.created_at) || new Date(),
      toDate(r.updated_at) || new Date(),
    ],
  },
  {
    name: "leads",
    columns: [
      "id",
      "name",
      "phone",
      "phone_normalized",
      "email",
      "source",
      "campaign",
      "city",
      "status",
      "assigned_to",
      "assigned_name",
      "attempt_count",
      "last_activity",
      "next_followup",
      "notes",
      "meta_leadgen_id",
      "closed_reason",
      "closed_reason_notes",
      "created_at",
      "updated_at",
    ],
    conflictKey: "id",
    batchSize: 2000,
    transform: (r) => [
      r.id,
      r.name || "Unknown",
      r.phone || "",
      toNullableString(r.phone_normalized),
      toNullableString(r.email),
      r.source || "Website",
      toNullableString(r.campaign),
      toNullableString(r.city),
      r.status || "new",
      toNullableString(r.assigned_to),
      toNullableString(r.assigned_name),
      parseInt(r.attempt_count || "0", 10),
      toDate(r.last_activity),
      toDate(r.next_followup),
      toNullableString(r.notes),
      toNullableString(r.meta_leadgen_id),
      toNullableString(r.closed_reason),
      toNullableString(r.closed_reason_notes),
      toDate(r.created_at) || new Date(),
      toDate(r.updated_at) || new Date(),
    ],
  },
  {
    name: "calls",
    columns: [
      "id",
      "lead_id",
      "user_id",
      "user_name",
      "outcome",
      "duration_minutes",
      "notes",
      "next_followup",
      "tata_call_id",
      "direction",
      "recording_url",
      "started_at",
      "answered_at",
      "ended_at",
      "customer_phone",
      "wrap_up_completed",
      "created_at",
    ],
    conflictKey: "id",
    batchSize: 2000,
    transform: (r) => [
      r.id,
      toNullableString(r.lead_id),
      toNullableString(r.user_id),
      r.user_name || "Unknown",
      toNullableString(r.outcome),
      parseInt(r.duration_minutes || "0", 10),
      toNullableString(r.notes),
      toDate(r.next_followup),
      toNullableString(r.tata_call_id),
      toNullableString(r.direction),
      toNullableString(r.recording_url),
      toDate(r.started_at),
      toDate(r.answered_at),
      toDate(r.ended_at),
      toNullableString(r.customer_phone),
      toBoolean(r.wrap_up_completed, false),
      toDate(r.created_at) || new Date(),
    ],
  },
  {
    name: "bookings",
    columns: [
      "id",
      "lead_id",
      "lead_name",
      "hotel_name",
      "check_in",
      "check_out",
      "final_price",
      "bid_price",
      "payment_status",
      "payment_amount",
      "notes",
      "booking_reason",
      "created_by_id",
      "created_at",
    ],
    conflictKey: "id",
    batchSize: 1000,
    transform: (r) => [
      r.id,
      r.lead_id,
      toNullableString(r.lead_name),
      r.hotel_name || "Package",
      toDate(r.check_in),
      toDate(r.check_out),
      parseFloat(r.final_price || "0"),
      r.bid_price != null ? parseFloat(r.bid_price) : null,
      r.payment_status || "unpaid",
      parseFloat(r.payment_amount || "0"),
      toNullableString(r.notes),
      toNullableString(r.booking_reason),
      r.created_by_id,
      toDate(r.created_at) || new Date(),
    ],
  },
  {
    name: "payments",
    columns: ["id", "booking_id", "amount", "notes", "created_by", "created_at"],
    conflictKey: "id",
    batchSize: 1000,
    transform: (r) => [
      r.id,
      r.booking_id,
      parseFloat(r.amount || "0"),
      toNullableString(r.notes),
      r.created_by,
      toDate(r.created_at) || new Date(),
    ],
  },
  {
    name: "activities",
    columns: ["id", "user_id", "user_name", "action", "target_id", "target_type", "target_name", "details", "created_at"],
    conflictKey: "id",
    batchSize: 3000,
    transform: (r) => [
      r.id,
      toNullableString(r.user_id),
      r.user_name || "System",
      r.action || "action",
      toNullableString(r.target_id),
      toNullableString(r.target_type),
      toNullableString(r.target_name),
      toNullableString(r.details),
      toDate(r.created_at) || new Date(),
    ],
  },
  {
    name: "notifications",
    columns: ["id", "user_id", "type", "priority", "title", "message", "target_id", "target_type", "metadata", "is_read", "created_at"],
    conflictKey: "id",
    batchSize: 4000,
    transform: (r) => [
      r.id,
      r.user_id,
      r.type || "system",
      r.priority || "medium",
      r.title || "Notification",
      r.message || "",
      toNullableString(r.target_id),
      toNullableString(r.target_type),
      parseJsonSafe(r.metadata),
      toBoolean(r.is_read, false),
      toDate(r.created_at) || new Date(),
    ],
  },
  {
    name: "saved_filters",
    columns: ["id", "user_id", "name", "filter_json", "created_at"],
    conflictKey: "id",
    batchSize: 1000,
    transform: (r) => [
      r.id,
      r.user_id,
      r.name || "Filter",
      parseJsonSafe(r.filter_json) || "{}",
      toDate(r.created_at) || new Date(),
    ],
  },
  {
    name: "push_subscriptions",
    columns: ["id", "user_id", "endpoint", "p256dh", "auth", "user_agent", "created_at", "updated_at"],
    conflictKey: "id",
    batchSize: 1000,
    transform: (r) => [
      r.id,
      r.user_id,
      r.endpoint,
      r.p256dh,
      r.auth,
      toNullableString(r.user_agent),
      toDate(r.created_at) || new Date(),
      toDate(r.updated_at) || new Date(),
    ],
  },
];

async function insertBatch(
  pgClient: PoolClient,
  table: TableMigrationConfig,
  rows: any[][]
): Promise<number> {
  if (rows.length === 0) return 0;

  const columnList = table.columns.map((c) => `"${c}"`).join(", ");

  const valuePlaceholders: string[] = [];
  const flatValues: any[] = [];
  let paramIdx = 1;

  for (const row of rows) {
    const placeholders: string[] = [];
    for (const val of row) {
      placeholders.push(`$${paramIdx++}`);
      flatValues.push(val);
    }
    valuePlaceholders.push(`(${placeholders.join(", ")})`);
  }

  const query = `
    INSERT INTO "${table.name}" (${columnList})
    VALUES ${valuePlaceholders.join(",\n")}
    ON CONFLICT ("${table.conflictKey}") DO NOTHING
  `;

  await pgClient.query(query, flatValues);
  return rows.length;
}

export async function runDataMigration(): Promise<{
  results: Record<string, { sourceCount: number; targetCount: number; status: string; durationMs: number }>;
  success: boolean;
}> {
  console.log("=== Bidinn CRM: Fast MySQL to PostgreSQL Data Migration ===");
  console.log(`Started at: ${new Date().toISOString()}`);

  const mysqlHost = process.env.DB_HOST || "127.0.0.1";
  const mysqlPort = parseInt(process.env.DB_PORT || "3306", 10);
  const mysqlUser = process.env.DB_USERNAME || process.env.DB_USER || "admin";
  const mysqlPassword = process.env.DB_PASSWORD || "";
  const mysqlDatabase = process.env.DB_DATABASE || process.env.DB_NAME || "bidinncrm";

  console.log(`Connecting to MySQL source: ${mysqlHost}:${mysqlPort}/${mysqlDatabase}...`);
  const mysqlConn = await mysql.createConnection({
    host: mysqlHost,
    port: mysqlPort,
    user: mysqlUser,
    password: mysqlPassword,
    database: mysqlDatabase,
    charset: "utf8mb4",
    connectTimeout: 60000,
  });
  console.log("MySQL connection established.");

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const isSsl =
    process.env.DB_SSL === "true" ||
    (databaseUrl && (databaseUrl.includes("sslmode=require") || databaseUrl.includes("neon.tech")));

  const pgPool = new Pool(
    databaseUrl
      ? {
          connectionString: databaseUrl,
          ssl: isSsl ? { rejectUnauthorized: false } : false,
          max: 5,
          connectionTimeoutMillis: 60000,
        }
      : {
          host: process.env.TARGET_DB_HOST || "localhost",
          port: parseInt(process.env.TARGET_DB_PORT || "5432", 10),
          user: process.env.TARGET_DB_USER || "postgres",
          password: process.env.TARGET_DB_PASSWORD || "",
          database: process.env.TARGET_DB_DATABASE || "bidinncrm",
          ssl: isSsl ? { rejectUnauthorized: false } : false,
          max: 5,
        }
  );

  const pgClient = await pgPool.connect();
  console.log("PostgreSQL connection established.");

  const results: Record<string, { sourceCount: number; targetCount: number; status: string; durationMs: number }> = {};
  let overallSuccess = true;

  try {
    for (const table of TABLE_CONFIGS) {
      const tableStart = Date.now();
      console.log(`\n--------------------------------------------------`);
      console.log(`Processing table: "${table.name}"`);

      const [[{ count: rawSourceCount }]] = await mysqlConn.query<any[]>(
        `SELECT COUNT(*) AS count FROM \`${table.name}\``
      );
      const sourceCount = Number(rawSourceCount || 0);
      console.log(`Source records in MySQL: ${sourceCount}`);

      const pgCountPre = await pgClient.query(`SELECT COUNT(*) AS count FROM "${table.name}"`);
      const targetCountPre = Number(pgCountPre.rows[0]?.count || 0);
      console.log(`Existing records in PostgreSQL: ${targetCountPre}`);

      if (sourceCount === 0) {
        results[table.name] = {
          sourceCount: 0,
          targetCount: targetCountPre,
          status: "EMPTY_SOURCE",
          durationMs: Date.now() - tableStart,
        };
        console.log(`Table "${table.name}" is empty on source. Skipped.`);
        continue;
      }

      if (sourceCount === targetCountPre) {
        results[table.name] = {
          sourceCount,
          targetCount: targetCountPre,
          status: "MATCHED (ALREADY COMPLETE)",
          durationMs: Date.now() - tableStart,
        };
        console.log(`Table "${table.name}" is already fully migrated (${targetCountPre}/${sourceCount}). Skipped.`);
        continue;
      }

      // High-performance keyset pagination via primary key index (O(1) seek per batch)
      let migrated = targetCountPre;
      let lastId: string | null = null;
      const batchSize = table.batchSize;

      while (true) {
        let query = `SELECT * FROM \`${table.name}\``;
        const params: any[] = [];

        if (lastId != null) {
          query += ` WHERE \`${table.conflictKey}\` > ? ORDER BY \`${table.conflictKey}\` ASC LIMIT ?`;
          params.push(lastId, batchSize);
        } else {
          query += ` ORDER BY \`${table.conflictKey}\` ASC LIMIT ?`;
          params.push(batchSize);
        }

        const [rows] = await mysqlConn.query<any[]>(query, params);

        if (!rows || rows.length === 0) break;

        const transformedRows = rows.map((r) => table.transform(r));
        await insertBatch(pgClient, table, transformedRows);

        lastId = rows[rows.length - 1][table.conflictKey];
        migrated += rows.length;

        const pct = Math.min(100, Math.round((migrated / sourceCount) * 100));
        process.stdout.write(`\r  Importing: ${migrated}/${sourceCount} (${pct}%)`);

        if (rows.length < batchSize) break;
      }
      process.stdout.write("\n");

      const pgCountResult = await pgClient.query(`SELECT COUNT(*) AS count FROM "${table.name}"`);
      const targetCount = Number(pgCountResult.rows[0]?.count || 0);
      const durationMs = Date.now() - tableStart;

      const isMatch = sourceCount === targetCount;
      if (!isMatch) overallSuccess = false;

      results[table.name] = {
        sourceCount,
        targetCount,
        status: isMatch ? "MATCHED" : "MISMATCH",
        durationMs,
      };

      console.log(
        `Table "${table.name}" finished in ${(durationMs / 1000).toFixed(2)}s: Source=${sourceCount}, Target=${targetCount} [${isMatch ? "OK" : "MISMATCH"}]`
      );
    }
  } catch (error) {
    console.error("Data migration error:", error);
    overallSuccess = false;
    throw error;
  } finally {
    pgClient.release();
    await pgPool.end();
    await mysqlConn.end();
  }

  console.log("\n==================================================");
  console.log("             DATA RECONCILIATION REPORT           ");
  console.log("==================================================");
  console.table(
    Object.entries(results).map(([table, data]) => ({
      Table: table,
      "MySQL Rows": data.sourceCount,
      "Postgres Rows": data.targetCount,
      Status: data.status,
      "Duration (s)": (data.durationMs / 1000).toFixed(2),
    }))
  );

  console.log(`\nOverall Data Migration Result: ${overallSuccess ? "PASSED (100% RECONCILED)" : "FAILED (MISMATCH DETECTED)"}`);
  console.log(`Completed at: ${new Date().toISOString()}`);

  return { results, success: overallSuccess };
}

if (require.main === module) {
  runDataMigration()
    .then(({ success }) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Fatal migration error:", err);
      process.exit(1);
    });
}
