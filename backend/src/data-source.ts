import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";
import path from "path";
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

export const AppDataSource = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "3306", 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
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
  charset: "utf8mb4",
  extra: {
    charset: "utf8mb4_unicode_ci",
    connectionLimit: 10,
    connectTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  },
});
