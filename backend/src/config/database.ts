import { Pool, PoolConfig } from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function createPgPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const isSsl =
    process.env.DB_SSL === "true" ||
    (databaseUrl && (databaseUrl.includes("sslmode=require") || databaseUrl.includes("neon.tech")));

  if (databaseUrl) {
    return new Pool({
      connectionString: databaseUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX || "10", 10),
      connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || "60000", 10),
      idleTimeoutMillis: 30000,
    });
  }

  const config: PoolConfig = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USERNAME || process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || process.env.DB_NAME || "bidinncrm",
    ssl: isSsl ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX || "10", 10),
    connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || "60000", 10),
    idleTimeoutMillis: 30000,
  };

  return new Pool(config);
}

const pool = createPgPool();

export default pool;
