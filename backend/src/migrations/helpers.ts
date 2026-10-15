import type { QueryRunner } from "typeorm";

export async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const isPostgres = (queryRunner.connection.options.type as string) === "postgres";
  if (isPostgres) {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = $1`,
      [table]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }
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
  const isPostgres = (queryRunner.connection.options.type as string) === "postgres";
  if (isPostgres) {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      [table, column]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }
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
  const isPostgres = (queryRunner.connection.options.type as string) === "postgres";
  if (isPostgres) {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM pg_indexes
       WHERE schemaname = current_schema() AND tablename = $1 AND indexname = $2`,
      [table, indexName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }
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
  const isPostgres = (queryRunner.connection.options.type as string) === "postgres";
  if (isPostgres) {
    const cleanColumns = columns.replace(/`/g, '"');
    await queryRunner.query(
      `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS "${indexName}" ON "${table}" (${cleanColumns})`
    );
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
  const isPostgres = (queryRunner.connection.options.type as string) === "postgres";
  if (isPostgres) {
    const pgDefinition = definition.replace(/TINYINT\(1\)/gi, "BOOLEAN");
    await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${pgDefinition}`);
    return;
  }
  await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

export async function foreignKeyExists(
  queryRunner: QueryRunner,
  table: string,
  constraintName: string
): Promise<boolean> {
  const isPostgres = (queryRunner.connection.options.type as string) === "postgres";
  if (isPostgres) {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM information_schema.table_constraints
       WHERE table_schema = current_schema()
         AND table_name = $1
         AND constraint_name = $2
         AND constraint_type = 'FOREIGN KEY'`,
      [table, constraintName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }
  const rows = await queryRunner.query(
    `SELECT COUNT(*) AS c FROM information_schema.table_constraints
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND constraint_name = ?
       AND constraint_type = 'FOREIGN KEY'`,
    [table, constraintName]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function addForeignKeyIfNotExists(
  queryRunner: QueryRunner,
  table: string,
  constraintName: string,
  column: string,
  referencedTable: string,
  referencedColumn: string,
  onDelete = "CASCADE"
): Promise<void> {
  if (await foreignKeyExists(queryRunner, table, constraintName)) {
    return;
  }
  const isPostgres = (queryRunner.connection.options.type as string) === "postgres";
  if (isPostgres) {
    await queryRunner.query(
      `ALTER TABLE "${table}" ADD CONSTRAINT "${constraintName}"
       FOREIGN KEY ("${column}") REFERENCES "${referencedTable}"("${referencedColumn}")
       ON DELETE ${onDelete} ON UPDATE NO ACTION`
    );
    return;
  }
  await queryRunner.query(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\`
     FOREIGN KEY (\`${column}\`) REFERENCES \`${referencedTable}\`(\`${referencedColumn}\`)
     ON DELETE ${onDelete} ON UPDATE NO ACTION`
  );
}
