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
import dotenv from "dotenv";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "3306"),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  synchronize: false, // Disabled to avoid index conflicts
  // logging: true,
  entities: [User, Lead, Call, Booking, Activity, MetaConfig, Payment, Notification],
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
  } catch (error) {
    console.error("Error connecting to database:", error);
    throw error;
  }
};
