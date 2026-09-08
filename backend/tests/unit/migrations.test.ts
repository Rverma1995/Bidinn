import "reflect-metadata";
import assert from "assert";
import mysql from "mysql2/promise";
import { DataSource, MigrationInterface, QueryRunner } from "typeorm";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

class AddMigrationTestColumn1788864000999 implements MigrationInterface {
  name = "AddMigrationTestColumn1788864000999";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`_migration_test_guard\`
      ADD COLUMN \`extra\` varchar(50) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`_migration_test_guard\`
      DROP COLUMN \`extra\`
    `);
  }
}

function test(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve(fn()).then(
    () => console.log(`PASS: ${name}`),
    (error) => {
      console.error(`FAIL: ${name}`);
      throw error;
    }
  );
}

async function main(): Promise<void> {
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const user = process.env.DB_USERNAME || "root";
  const password = process.env.DB_PASSWORD ?? "";
  const testDatabase = process.env.MIGRATION_TEST_DATABASE || "bidinncrm_migration_test";

  let adminConnection: mysql.Connection | null = null;
  try {
    adminConnection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });
  } catch (error) {
    console.log("SKIP: MySQL is not available for migration tests");
    return;
  }

  await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${testDatabase}\``);

  const dataSource = new DataSource({
    type: "mysql",
    host,
    port,
    username: user,
    password,
    database: testDatabase,
    synchronize: false,
    migrationsRun: false,
    entities: [],
    migrations: [AddMigrationTestColumn1788864000999],
    charset: "utf8mb4",
  });

  await test("migration preserves existing rows", async () => {
    await dataSource.initialize();

    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS \`_migration_test_guard\` (
        \`id\` int NOT NULL,
        \`name\` varchar(100) NOT NULL,
        PRIMARY KEY (\`id\`)
      )
    `);
    await dataSource.query("DELETE FROM `_migration_test_guard`");
    await dataSource.query(
      "INSERT INTO `_migration_test_guard` (`id`, `name`) VALUES (?, ?)",
      [1, "keep-me"]
    );

    await dataSource.runMigrations({ transaction: "each" });

    const rows = await dataSource.query(
      "SELECT `id`, `name`, `extra` FROM `_migration_test_guard` WHERE `id` = 1"
    );
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].name, "keep-me");
    assert.strictEqual(rows[0].extra, null);

    await dataSource.undoLastMigration({ transaction: "each" });

    const columns = await dataSource.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = '_migration_test_guard'
         AND column_name = 'extra'`
    );
    assert.strictEqual(Number(columns[0].c), 0);

    const rowsAfterRevert = await dataSource.query(
      "SELECT `id`, `name` FROM `_migration_test_guard` WHERE `id` = 1"
    );
    assert.strictEqual(rowsAfterRevert.length, 1);
    assert.strictEqual(rowsAfterRevert[0].name, "keep-me");

    await dataSource.query("DROP TABLE IF EXISTS `_migration_test_guard`");
    await dataSource.destroy();
  });

  await adminConnection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
  await adminConnection.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
