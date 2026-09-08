# Database migrations

Bidinn CRM uses [TypeORM migrations](https://typeorm.io/migrations) with an explicit, backup-first workflow. Schema changes are **never** applied via `synchronize` or on server startup.

## Prerequisites

- MySQL backup tooling: one of
  - `mysqldump` on your `PATH` (install with `brew install mysql-client`)
  - `MYSQLDUMP_PATH` pointing at a local `mysqldump` binary
  - A running Docker MySQL/MariaDB container (auto-detected when `DB_HOST` is `localhost` / `127.0.0.1`, or set `MYSQL_BACKUP_DOCKER_CONTAINER`)
- Database credentials in `.env` (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`)

## Day-to-day workflow

### 1. Change an entity

Edit the relevant file under `src/entities/`.

### 2. Generate a migration

```bash
yarn migration:generate DescriptiveName
```

This compares your entities to the current database schema and writes a new file under `src/migrations/`.

With npm, use `npm run migration:generate -- DescriptiveName` (note the `--`).

Review the generated SQL carefully before applying it.

### 3. Apply migrations (one command)

```bash
npm run migrate
```

This command:

1. Creates a timestamped `mysqldump` backup under `backups/` (or `MIGRATION_BACKUP_DIR`)
2. Scans pending migrations for destructive SQL (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, unqualified `DELETE FROM`, etc.)
3. Runs pending migrations inside InnoDB transactions

If destructive SQL is detected, the command aborts unless you pass `--force`:

```bash
npm run migrate -- --force
```

To skip the pre-migration backup (faster for local dev; still runs safety checks):

```bash
npm run migrate -- --skip-backup
```

Or set `MIGRATION_SKIP_BACKUP=true` in `.env`.

Running `npm run migrate` again with no new migrations is a safe no-op.

## Backup vs data loss

**Backup and data loss are separate concerns.**

| What prevents data loss | What backup does |
|-------------------------|------------------|
| `synchronize: false` — no silent auto-schema changes | Gives you a restore point if something goes wrong |
| Each migration runs in an **InnoDB transaction** — failed migrations roll back automatically | Useful for production deploys and risky migrations |
| **Destructive SQL scan** blocks `DROP TABLE`, `TRUNCATE`, etc. unless `--force` | Not required for additive migrations (`ADD COLUMN`, new indexes, new tables) |
| You review generated migrations before applying | |

Skipping backup does **not** mean you will lose data. It only means you have no automatic `.sql` dump to restore from if a migration fails in an unexpected way. For local development with additive migrations, `--skip-backup` is fine. Use full `npm run migrate` (with backup) for production.

## Rollback

Revert the most recently applied migration:

```bash
npm run migration:revert
```

For larger failures, restore from the backup printed by `npm run migrate`:

```bash
mysql -h <host> -P <port> -u <user> -p <database> < backups/pre-migration-YYYYMMDD-HHmmss.sql
```

## Other commands

| Command | Purpose |
|---------|---------|
| `yarn migration:create DescriptiveName` | Create an empty migration stub |
| `npm run migration:run` | Run pending migrations directly (no backup guard) |
| `npm run typeorm -- migration:show` | List migration status |

Prefer `npm run migrate` in normal use — it always backs up first.

## Production deploy

Migrations are **not** run on `pm2-runtime` startup. Run them as a deliberate deploy step:

```bash
npm run build
npm run migrate
npm run start
```

Optional: wire `npm run predeploy` into your deployment pipeline if you want a guarded production path (see `package.json`).

## Baseline migration

`src/migrations/1788864000000-InitialBaseline.ts` captures the current schema using idempotent DDL (`IF NOT EXISTS` / column and index guards). On an existing production database it should apply as a no-op while still bootstrapping fresh environments.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MIGRATION_BACKUP_DIR` | `backups/` | Directory for pre-migration SQL dumps |
| `MYSQLDUMP_PATH` | _(auto-detect)_ | Full path to `mysqldump` when not on `PATH` |
| `MYSQL_BACKUP_DOCKER_CONTAINER` | _(auto-detect)_ | Docker container used for `mysqldump` when no local binary is found |
| `TYPEORM_LOGGING` | `false` | Set to `true` to log SQL from the TypeORM CLI |

`synchronize` is hardcoded to `false` in `src/data-source.ts`. Do not re-enable auto-sync.
