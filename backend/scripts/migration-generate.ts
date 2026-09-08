import { spawnSync } from "child_process";
import path from "path";
import { resolveMigrationName } from "./migration-args";

const backendRoot = path.resolve(__dirname, "..");
const name = resolveMigrationName("migration:generate");
const outputPath = path.join("src", "migrations", name);

const result = spawnSync(
  "npx",
  ["typeorm-ts-node-commonjs", "-d", "src/data-source.ts", "migration:generate", outputPath],
  { cwd: backendRoot, stdio: "inherit" }
);

process.exit(result.status ?? 1);
