import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import dotenv from "dotenv";
import path from "path";
import pg from "pg";
import { User } from "./entities/User";
import { Lead } from "./entities/Lead";
import { Call } from "./entities/Call";
import { Booking } from "./entities/Booking";
import { Activity } from "./entities/Activity";
import { MetaConfig } from "./entities/MetaConfig";
import { Payment } from "./entities/Payment";
import { Notification } from "./entities/Notification";
import { SavedFilter } from "./entities/SavedFilter";
import { PushSubscription } from "./entities/PushSubscription";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Ensure numeric/decimal types in PostgreSQL are parsed as JavaScript numbers
pg.types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));

export function buildPostgresOptions(): DataSourceOptions {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const isSsl =
    process.env.DB_SSL === "true" ||
    (databaseUrl && (databaseUrl.includes("sslmode=require") || databaseUrl.includes("neon.tech")));

  const commonOptions = {
    type: "postgres" as const,
    synchronize: false,
    migrationsRun: false,
    logging: process.env.TYPEORM_LOGGING === "true",
    entities: [
      User,
      Lead,
      Call,
      Booking,
      Activity,
      MetaConfig,
      Payment,
      Notification,
      SavedFilter,
      PushSubscription,
    ],
    migrations: [path.join(__dirname, "migrations", "[0-9]*-*.{ts,js}")],
    subscribers: [],
    ssl: isSsl ? { rejectUnauthorized: false } : false,
    extra: {
      max: parseInt(process.env.DB_POOL_MAX || "10", 10),
      connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || "60000", 10),
      idleTimeoutMillis: 30000,
    },
  };

  if (databaseUrl) {
    return {
      ...commonOptions,
      url: databaseUrl,
    };
  }

  return {
    ...commonOptions,
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    username: process.env.DB_USERNAME || process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || process.env.DB_NAME || "bidinncrm",
  };
}

export const AppDataSource = new DataSource(buildPostgresOptions());
