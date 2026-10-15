import "reflect-metadata";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { AppDataSource } from "../src/data-source";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const BACKEND_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "src", "migrations");

type DestructiveFinding = {
  file: string;
  statements: string[];
};

const DESTRUCTIVE_CHECKS: Array<{ label: string; pattern: RegExp }> = [
  { label: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { label: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { label: "DROP INDEX", pattern: /\bDROP\s+INDEX\b/i },
  { label: "DROP DATABASE", pattern: /\bDROP\s+DATABASE\b/i },
  { label: "TRUNCATE TABLE", pattern: /\bTRUNCATE\s+TABLE\b/i },
  { label: "ALTER TABLE ... DROP", pattern: /\bALTER\s+TABLE\b[\s\S]*?\bDROP\b/i },
];

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function extractUpMethodSql(raw: string): string {
  const match = raw.match(/public\s+async\s+up\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\s*\}/);
  return match?.[1] ?? raw;
}

function findDestructiveStatements(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const sql = stripSqlComments(extractUpMethodSql(raw));
  const findings: string[] = [];

  for (const check of DESTRUCTIVE_CHECKS) {
    if (check.pattern.test(sql)) {
      findings.push(check.label);
    }
  }

  const deletePattern = /\bDELETE\s+FROM\s+[`'"]?(\w+)[`'"]?\s*([^;]*)/gi;
  for (const match of sql.matchAll(deletePattern)) {
    const clause = match[2] ?? "";
    if (!/\bWHERE\b/i.test(clause)) {
      findings.push(`DELETE FROM ${match[1]} without WHERE`);
    }
  }

  return findings;
}

function formatTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function resolveBackupDir(): string {
  const configured = process.env.MIGRATION_BACKUP_DIR;
  return configured
    ? path.isAbsolute(configured)
      ? configured
      : path.resolve(BACKEND_ROOT, configured)
    : path.join(BACKEND_ROOT, "backups");
}

type BackupRunner =
  | { mode: "local"; binary: string; dialect: "postgres" | "mysql" }
  | { mode: "docker"; container: string; dialect: "postgres" | "mysql" };

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveLocalPgDump(): string | null {
  const configured = process.env.PGDUMP_PATH?.trim();
  if (configured && isExecutable(configured)) {
    return configured;
  }

  const which = spawnSync("which", ["pg_dump"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  const candidates = [
    "/opt/homebrew/opt/postgresql@18/bin/pg_dump",
    "/Applications/Postgres.app/Contents/Versions/17/bin/pg_dump",
    "/Applications/Postgres.app/Contents/Versions/16/bin/pg_dump",
    "/Applications/Postgres.app/Contents/Versions/15/bin/pg_dump",
    "/opt/homebrew/opt/libpq/bin/pg_dump",
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump",
    "/opt/homebrew/opt/postgresql@16/bin/pg_dump",
    "/opt/homebrew/bin/pg_dump",
    "/usr/local/opt/libpq/bin/pg_dump",
    "/usr/local/bin/pg_dump",
  ];

  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveLocalMysqldump(): string | null {
  const configured = process.env.MYSQLDUMP_PATH?.trim();
  if (configured && isExecutable(configured)) {
    return configured;
  }

  const which = spawnSync("which", ["mysqldump"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  const candidates = [
    "/opt/homebrew/opt/mysql-client/bin/mysqldump",
    "/opt/homebrew/opt/mysql/bin/mysqldump",
    "/usr/local/opt/mysql-client/bin/mysqldump",
    "/usr/local/opt/mysql/bin/mysqldump",
    "/usr/local/mysql/bin/mysqldump",
  ];

  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveBackupRunner(dialect: "postgres" | "mysql"): BackupRunner {
  if (dialect === "postgres") {
    const localBinary = resolveLocalPgDump();
    if (localBinary) {
      return { mode: "local", binary: localBinary, dialect: "postgres" };
    }
    throw new Error(
      "pg_dump not found. Install PostgreSQL client tools (e.g. `brew install libpq` or Postgres.app), " +
        "or set PGDUMP_PATH in your environment."
    );
  }

  const localBinary = resolveLocalMysqldump();
  if (localBinary) {
    return { mode: "local", binary: localBinary, dialect: "mysql" };
  }

  throw new Error(
    "mysqldump not found. Install MySQL client tools (e.g. `brew install mysql-client`), " +
      "or set MYSQLDUMP_PATH in your environment."
  );
}

function getMigrationClassName(filePath: string): string | null {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/export class (\w+) implements MigrationInterface/);
  return match?.[1] ?? null;
}

async function getPendingMigrationFiles(): Promise<string[]> {
  let executed = new Set<string>();
  try {
    const executedRows: Array<{ name: string }> = await AppDataSource.query("SELECT name FROM migrations");
    executed = new Set(executedRows.map((row) => row.name));
  } catch {
    // migrations table does not exist yet on first run
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".ts") && file !== "helpers.ts")
    .sort();

  const pending: string[] = [];
  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const className = getMigrationClassName(fullPath);
    if (!className) {
      continue;
    }
    if (!executed.has(className)) {
      pending.push(fullPath);
    }
  }

  return pending;
}

function runBackup(backupPath: string, dialect: "postgres" | "mysql"): BackupRunner {
  const runner = resolveBackupRunner(dialect);
  if (runner.mode !== "local") {
    throw new Error("Docker backup mode not supported");
  }

  if (dialect === "postgres") {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    const outputFd = fs.openSync(backupPath, "w");

    let result;
    if (databaseUrl) {
      result = spawnSync(runner.binary, ["--clean", "--if-exists", "--no-owner", "--no-privileges", `--dbname=${databaseUrl}`], {
        stdio: ["ignore", outputFd, "pipe"],
        maxBuffer: 50 * 1024 * 1024,
      });
    } else {
      const host = process.env.DB_HOST || "localhost";
      const port = process.env.DB_PORT || "5432";
      const username = process.env.DB_USERNAME || process.env.DB_USER || "postgres";
      const password = process.env.DB_PASSWORD ?? "";
      const database = process.env.DB_DATABASE || process.env.DB_NAME || "bidinncrm";

      result = spawnSync(
        runner.binary,
        ["-h", host, "-p", port, "-U", username, "-d", database, "--clean", "--if-exists", "--no-owner", "--no-privileges"],
        {
          stdio: ["ignore", outputFd, "pipe"],
          env: { ...process.env, PGPASSWORD: password },
          maxBuffer: 50 * 1024 * 1024,
        }
      );
    }
    fs.closeSync(outputFd);

    if (result.status !== 0) {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      const stderr = result.stderr?.toString().trim();
      const details = stderr || result.error?.message || `exit code ${result.status ?? "unknown"}`;
      throw new Error(`Database backup failed: ${details}`);
    }

    return runner;
  }

  const host = process.env.DB_HOST || "127.0.0.1";
  const port = process.env.DB_PORT || "3306";
  const username = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_DATABASE;

  if (!username || !database) {
    throw new Error("DB_USERNAME and DB_DATABASE must be set in .env before running migrations.");
  }

  const dumpArgs = [
    `-u${username}`,
    `--single-transaction`,
    `--routines`,
    `--triggers`,
    `--set-gtid-purged=OFF`,
    database,
  ];

  const outputFd = fs.openSync(backupPath, "w");
  const dump = spawnSync(runner.binary, [`-h${host}`, `-P${port}`, ...dumpArgs], {
    stdio: ["ignore", outputFd, "pipe"],
    env: { ...process.env, MYSQL_PWD: password },
    maxBuffer: 10 * 1024 * 1024,
  });
  fs.closeSync(outputFd);

  if (dump.status !== 0) {
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    const stderr = dump.stderr?.toString().trim();
    const details = stderr || dump.error?.message || `exit code ${dump.status ?? "unknown"}`;
    throw new Error(`Database backup failed: ${details}`);
  }

  return runner;
}

function printRestoreInstructions(backupPath: string, dialect: "postgres" | "mysql"): void {
  console.error("\nMigration failed. Your pre-migration backup is here:");
  console.error(`  ${backupPath}`);
  console.error("\nRestore manually with:");

  if (dialect === "postgres") {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      console.error(`  psql "${databaseUrl}" < ${backupPath}`);
    } else {
      const host = process.env.DB_HOST || "localhost";
      const port = process.env.DB_PORT || "5432";
      const username = process.env.DB_USERNAME || process.env.DB_USER || "postgres";
      const database = process.env.DB_DATABASE || process.env.DB_NAME || "bidinncrm";
      console.error(`  psql -h ${host} -p ${port} -U ${username} -d ${database} < ${backupPath}`);
    }
  } else {
    const host = process.env.DB_HOST || "127.0.0.1";
    const port = process.env.DB_PORT || "3306";
    const username = process.env.DB_USERNAME || "root";
    const database = process.env.DB_DATABASE || "bidinncrm";
    console.error(`  mysql -h ${host} -P ${port} -u ${username} -p ${database} < ${backupPath}`);
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const skipBackup =
    process.argv.includes("--skip-backup") || process.env.MIGRATION_SKIP_BACKUP === "true";
  const dialect: "postgres" | "mysql" = (AppDataSource.options.type as "postgres" | "mysql") || "postgres";

  let backupPath: string | null = null;
  let backupRunner: BackupRunner | undefined;

  if (skipBackup) {
    console.log("Step 1/3: Skipping database backup (--skip-backup).");
    console.log(
      "Note: skipping backup does not skip safety checks. Migrations still run in transactions and destructive SQL is still blocked."
    );
  } else {
    const backupDir = resolveBackupDir();
    fs.mkdirSync(backupDir, { recursive: true });
    backupPath = path.join(backupDir, `pre-migration-${formatTimestamp()}.sql`);

    console.log(`Step 1/3: Creating database backup using ${dialect === "postgres" ? "pg_dump" : "mysqldump"}...`);
    backupRunner = runBackup(backupPath, dialect);
    console.log(`Backup created: ${backupPath}`);
  }

  let initialized = false;
  try {
    await AppDataSource.initialize();
    initialized = true;

    console.log("Step 2/3: Scanning pending migrations for destructive SQL...");
    const pendingFiles = await getPendingMigrationFiles();
    if (pendingFiles.length === 0) {
      console.log("No pending migrations. Database is up to date.");
      if (backupPath) {
        console.log(`Backup (no changes applied): ${backupPath}`);
      }
      return;
    }

    const destructiveFindings: DestructiveFinding[] = [];
    for (const file of pendingFiles) {
      const statements = findDestructiveStatements(file);
      if (statements.length > 0) {
        destructiveFindings.push({ file, statements });
      }
    }

    if (destructiveFindings.length > 0 && !force) {
      console.error("\nDestructive SQL detected in pending migrations:");
      for (const finding of destructiveFindings) {
        console.error(`  ${path.basename(finding.file)}`);
        for (const statement of finding.statements) {
          console.error(`    - ${statement}`);
        }
      }
      console.error("\nAborting. Re-run with --force if you accept the risk after reviewing the migration.");
      process.exitCode = 1;
      return;
    }

    console.log("Step 3/3: Running pending migrations...");
    const applied = await AppDataSource.runMigrations({ transaction: "each" });

    if (applied.length === 0) {
      console.log("No migrations were applied.");
    } else {
      console.log("Applied migrations:");
      for (const migration of applied) {
        console.log(`  - ${migration.name}`);
      }
    }

    if (backupPath) {
      console.log(`\nMigration complete. Backup stored at:\n  ${backupPath}`);
    } else {
      console.log("\nMigration complete (no backup was created).");
    }
  } catch (error) {
    console.error("\nMigration failed:", error instanceof Error ? error.message : error);
    if (backupPath) {
      printRestoreInstructions(backupPath, dialect);
    } else {
      console.error(
        "No backup was taken. If the database is in a bad state, restore from an external backup or run `npm run migration:revert`."
      );
    }
    process.exitCode = 1;
  } finally {
    if (initialized && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
