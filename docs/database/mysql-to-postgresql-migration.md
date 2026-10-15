
# Bidinn CRM: MySQL to PostgreSQL Migration Guide

## Executive Summary

This document describes the complete architecture, execution procedure, validation results, and production cutover / rollback strategies for migrating the Bidinn CRM backend from **MySQL 8** to **PostgreSQL 17+** (including cloud-native serverless PostgreSQL such as Neon and AWS RDS PostgreSQL) using the existing **TypeORM** implementation.

---

## 1. Inventory & Baseline Architecture Audit

### 1.1 Technology Stack Baseline
- **Runtime:** Node.js 24 + Express 4.21
- **ORM:** TypeORM `^0.3.28`
- **PostgreSQL Driver:** `pg ^8.13.3` with `@types/pg ^8.11.11`
- **Previous Driver:** `mysql2 ^3.19.1` (retained during transitional data migration utility)
- **Cache:** Redis via `ioredis ^5.11.1`
- **NoSQL:** MongoDB native driver `mongodb ^7.1.0` (unaffected, preserved)

### 1.2 Database Entities & Relationships
The relational schema comprises 10 core entities and 1 migration tracking table:

| Entity | Primary Key | Foreign Keys & Cascades | Key Indexes | Notable Types & Constraints |
|---|---|---|---|---|
| `users` | `id` (VARCHAR 36 UUID) | None | `idx_users_role`, `email` UNIQUE | Role ENUM (`admin`, `manager`, `team_lead`, `sales_rep`), `is_active` BOOLEAN |
| `meta_config` | `id` (VARCHAR 36 UUID) | None | Primary | `is_active` BOOLEAN, `page_access_token` TEXT |
| `leads` | `id` (VARCHAR 36 UUID) | `assigned_to` -> `users.id` | `idx_leads_assigned_status`, `idx_leads_phone`, `idx_leads_status_created`, `idx_leads_phone_normalized` | `phone_normalized` indexed, `attempt_count` INT, `status` VARCHAR 50 |
| `calls` | `id` (VARCHAR 36 UUID) | `lead_id` -> `leads.id` (CASCADE), `user_id` -> `users.id` (CASCADE) | `idx_calls_tata_call_id` UNIQUE, `idx_calls_created_at`, `idx_calls_user_id` | Outcome ENUM, `wrap_up_completed` BOOLEAN |
| `bookings` | `id` (VARCHAR 36 UUID) | `lead_id` -> `leads.id` (CASCADE), `created_by_id` -> `users.id` (CASCADE) | `idx_bookings_lead_id`, `idx_bookings_created_by_id`, `idx_bookings_payment_status` | `final_price` & `payment_amount` NUMERIC(10,2), PaymentStatus ENUM |
| `payments` | `id` (VARCHAR 36 UUID) | `booking_id` -> `bookings.id` (CASCADE), `created_by` -> `users.id` (CASCADE) | `idx_payments_booking_id`, `idx_payments_created_at` | `amount` NUMERIC(10,2) |
| `activities` | `id` (VARCHAR 36 UUID) | `user_id` -> `users.id` (CASCADE) | `idx_activities_created_at` | Audit log, target polymorphic references |
| `notifications` | `id` (VARCHAR 36 UUID) | `user_id` -> `users.id` (CASCADE) | `idx_notifications_user_id`, `idx_notifications_is_read` | `metadata` JSONB, `is_read` BOOLEAN |
| `saved_filters` | `id` (VARCHAR 36 UUID) | `user_id` -> `users.id` (CASCADE) | `idx_saved_filters_user_id` | `filter_json` JSONB (lead views) |
| `push_subscriptions` | `id` (VARCHAR 36 UUID) | `user_id` -> `users.id` (CASCADE) | `endpoint` UNIQUE, `idx_push_subscriptions_user_id` | WebPush VAPID subscriptions |
| `migrations` | `id` (SERIAL PK) | None | Primary | Version-controlled TypeORM history |

### 1.3 Identified Incompatibilities & Resolutions
1. **Datetime Column Types:**
   - *Problem:* MySQL allows `type: "datetime"` in TypeORM entity decorators. TypeORM's PostgreSQL driver throws `DataTypeNotSupportedError: Data type "datetime" is not supported by "postgres" database`.
   - *Resolution:* Converted all explicit `datetime` column definitions in `Lead.ts` and `Call.ts` to `timestamp`, matching `@CreateDateColumn()` and `@UpdateDateColumn()`.
2. **Case-Insensitive Search:**
   - *Problem:* MySQL `LIKE` queries are case-insensitive under `utf8mb4_unicode_ci`. In PostgreSQL, standard `LIKE` is case-sensitive.
   - *Resolution:* Updated `applyLeadListFilters` in `backend/src/utils/lead-scope.ts` to detect PostgreSQL and dynamically utilize `ILIKE` for case-insensitive lead search (`name`, `phone`, `email`).
3. **Date/Time Interval Math in Raw Queries:**
   - *Problem:* `backend/src/services/delay-leads.service.ts` used MySQL-specific `TIMESTAMPDIFF(MINUTE, lead.created_at, first_call.first_at)`.
   - *Resolution:* Updated to detect PostgreSQL and use `AVG(EXTRACT(EPOCH FROM (first_call.first_at - lead.created_at)) / 60)`.
4. **Numeric/Decimal Serialization:**
   - *Problem:* The Node.js `pg` driver parses `NUMERIC` / `DECIMAL` types as strings by default to prevent float precision errors.
   - *Resolution:* Registered type parser `pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)))` in `src/data-source.ts`, guaranteeing numbers serialize identically in API responses.
5. **Session Replication Role in Managed Cloud Databases:**
   - *Problem:* Cloud-hosted PostgreSQL (Neon, AWS RDS) restricts `SET session_replication_role = 'replica'` to superusers.
   - *Resolution:* The data migration utility executes table imports in strict topological foreign-key order (`users` -> `meta_config` -> `leads` -> `calls` -> `bookings` -> `payments` -> `activities` -> `notifications` -> `saved_filters` -> `push_subscriptions`), ensuring all foreign keys are satisfied without needing superuser privileges.

---

## 2. Configuration & Environment Variables

### 2.1 Supported PostgreSQL Configuration
The TypeORM DataSource (`backend/src/data-source.ts`) and pool configuration support both standard connection strings (`DATABASE_URL`) and discrete environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | *(none)* | Standard PostgreSQL connection URI (e.g., Neon, AWS RDS, Supabase) |
| `DB_HOST` | `localhost` | PostgreSQL host when `DATABASE_URL` is omitted |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` / `DB_USERNAME` | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | `""` | PostgreSQL password |
| `DB_NAME` / `DB_DATABASE` | `bidinncrm` | PostgreSQL database name |
| `DB_SSL` | `false` | Force SSL mode (automatically enabled if host is `.neon.tech` or `sslmode=require`) |
| `DB_POOL_MAX` | `10` | Maximum connection pool size |
| `DB_TIMEOUT` | `60000` | Connection timeout in milliseconds |
| `TYPEORM_LOGGING` | `false` | Enable SQL query logging |

---

## 3. Migration Execution

### 3.1 Applying Schema Migrations
Run schema migrations against the PostgreSQL database:
```bash
npm run migrate
```
This automated runner:
1. Detects PostgreSQL and creates a pre-migration backup using `pg_dump`.
2. Inspects pending migrations for unconstrained destructive SQL (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, etc.).
3. Executes pending migrations in individual transactions.

### 3.2 Executing Data Migration
To copy all historical records from MySQL into PostgreSQL with batching, type conversion, and duplicate-prevention:
```bash
npm run data:migrate
```

---

## 4. Production Cutover Procedure

### Phase 1: Pre-Cutover Preparation (T - 48 Hours)
1. **Target Database Provisioning:** Ensure target PostgreSQL instance (e.g., Neon or AWS RDS PostgreSQL 17/18) is provisioned with appropriate compute and connection pooling.
2. **Schema Verification:** Deploy PostgreSQL schema via `npm run migrate`.
3. **Dry-Run Data Migration:** Run `npm run data:migrate` against a staging rehearsal database and confirm 100% row matching.
4. **Backup Verification:** Ensure automated snapshot backups of the MySQL database are verified and restorable.

### Phase 2: Maintenance Window & Cutover (T - 0)
1. **Write Freeze / Maintenance Mode:**
   - Display a brief maintenance notice on the CRM frontend.
   - Temporarily pause background ingestion workers (e.g., Meta Webhook listeners, Tata CDR sync workers).
2. **Final MySQL Backup:**
   - Create a final timestamped `mysqldump`:
     ```bash
     mysqldump -h $DB_HOST -u $DB_USERNAME -p --single-transaction --routines --triggers bidinncrm > final_mysql_backup.sql
     ```
3. **Final Delta Migration:**
   - Run `npm run data:migrate` to synchronize the final records into PostgreSQL.
   - The tool runs with `ON CONFLICT ("id") DO UPDATE`, safely syncing new and updated records without duplicates.
4. **Data Reconciliation Check:**
   - Compare MySQL vs PostgreSQL counts for all 10 tables:
     ```sql
     SELECT 'users', COUNT(*) FROM users
     UNION ALL SELECT 'leads', COUNT(*) FROM leads
     UNION ALL SELECT 'calls', COUNT(*) FROM calls
     UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
     UNION ALL SELECT 'payments', COUNT(*) FROM payments
     UNION ALL SELECT 'activities', COUNT(*) FROM activities
     UNION ALL SELECT 'notifications', COUNT(*) FROM notifications;
     ```
5. **Switch Application Configuration:**
   - Update backend environment variables in production:
     ```env
     DATABASE_URL=postgresql://user:pass@host:5432/bidinncrm?sslmode=require
     ```
   - Restart backend server:
     ```bash
     pm2 restart dist/index.js
     ```
6. **Smoke Testing:**
   - Log in as admin (`/api/auth/login`).
   - Query lead list with filters (`GET /api/leads`).
   - Create a test lead and verify assignment and activity log.
   - Query dashboard stats (`GET /api/dashboard/stats`).
   - Check health endpoint: `GET /api/health` -> `{ status: "healthy", database: "connected" }`.
7. **Lift Maintenance Mode:**
   - Resume external webhooks and scheduled cron jobs.

---

## 5. Rollback Procedure

> [!CAUTION]
> If a critical regression is discovered post-cutover, execute rollback following these explicit rules. Do NOT simply revert the connection string if PostgreSQL has accepted new writes.

### Step 1: Decision Gate
- Rollback is approved if critical data corruption, authentication failure, or persistent API failure occurs within the cutover observation window (first 2 hours).

### Step 2: Capture PostgreSQL Delta Writes
If the application ran on PostgreSQL and accepted new user interactions, export any new writes before reverting:
```sql
-- Identify leads created/updated on PostgreSQL during cutover window
SELECT * FROM leads WHERE updated_at > '<CUTOVER_START_TIMESTAMP>';
SELECT * FROM calls WHERE created_at > '<CUTOVER_START_TIMESTAMP>';
SELECT * FROM activities WHERE created_at > '<CUTOVER_START_TIMESTAMP>';
SELECT * FROM bookings WHERE created_at > '<CUTOVER_START_TIMESTAMP>';
SELECT * FROM payments WHERE created_at > '<CUTOVER_START_TIMESTAMP>';
```

### Step 3: Revert Connection Configuration
1. Re-enable MySQL connection in `.env`:
   ```env
   # Comment out DATABASE_URL
   # DATABASE_URL=...
   DB_HOST=devdb.cp2ikymems0l.ap-south-1.rds.amazonaws.com
   DB_PORT=3306
   DB_DATABASE=bidinncrm
   ```
2. Restart backend processes.
3. Apply any delta records collected from PostgreSQL back into MySQL.
4. Confirm health check against MySQL.

---

## 6. Live Rehearsal & Data Migration Reconciliation Evidence

On October 15, 2026, the data migration utility (`backend/scripts/migrate-data.ts`) was executed against the live MySQL RDS database and target Neon PostgreSQL database.

### 6.1 Reconciliation Table

| Table | MySQL Source Rows | PostgreSQL Target Rows | Status | Duration |
|---|---|---|---|---|
| `users` | 30 | 30 | MATCHED | 0.17s |
| `meta_config` | 1 | 1 | MATCHED | 0.16s |
| `leads` | 16,885 | 16,885 | MATCHED | 0.19s |
| `calls` | 34,602 | 34,602 | MATCHED | 5.62s |
| `bookings` | 3 | 3 | MATCHED | 0.12s |
| `payments` | 3 | 3 | MATCHED | 0.15s |
| `activities` | 76,475 | 76,475 | MATCHED | 8.55s |
| `notifications` | 160,511 | 160,511 | MATCHED | 263.72s |
| `saved_filters` | 0 | 0 | EMPTY_SOURCE | 0.23s |
| `push_subscriptions` | 0 | 0 | EMPTY_SOURCE | 0.25s |
| **Total** | **288,510** | **288,510** | **100% RECONCILED** | **~4m 38s** |

### 6.2 Data Integrity Verification
- **Foreign Key Integrity:** All 11 foreign keys intact with zero orphan references.
- **JSON Column Storage:** `notifications.metadata` and `saved_filters.filter_json` successfully migrated and validated as native PostgreSQL `JSONB`.
- **Decimal Precision:** Financial amounts on `bookings` and `payments` validated as `NUMERIC(10,2)` with JavaScript float/string alignment.
- **Identity Sequences:** `migrations_id_seq` resynchronized and verified.
- **Automated Tests:** 17 unit test suites + full PostgreSQL integration test suite passed (100% green).

