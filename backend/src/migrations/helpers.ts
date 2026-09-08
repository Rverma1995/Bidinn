import type { QueryRunner } from "typeorm";

export async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function columnExists(
  queryRunner: QueryRunner,
  table: string,
  column: string
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function indexExists(
  queryRunner: QueryRunner,
  table: string,
  indexName: string
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT COUNT(*) AS c FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function createIndexIfNotExists(
  queryRunner: QueryRunner,
  table: string,
  indexName: string,
  columns: string,
  unique = false
): Promise<void> {
  if (await indexExists(queryRunner, table, indexName)) {
    return;
  }
  await queryRunner.query(
    `CREATE ${unique ? "UNIQUE " : ""}INDEX \`${indexName}\` ON \`${table}\` (${columns})`
  );
}

export async function addColumnIfNotExists(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (await columnExists(queryRunner, table, column)) {
    return;
  }
  await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}
