// Prepara la base de pruebas: la crea si no existe, aplica las migraciones y la vacía.
// Uso: npm run test:db:prepare            (crear + migrar + limpiar)
//      npm run test:db:prepare -- --check (solo valida destino y conexión; no escribe)
//
// Toda operación que escribe valida antes su destino. El nombre de la base que se crea,
// migra o limpia es siempre la constante TEST_DATABASE_NAME: no existe ninguna ruta
// que use otro nombre.
import { spawnSync } from "node:child_process";
import {
  TEST_DATABASE_NAME,
  UnsafeTestDatabaseError,
  assertConnectedToTestDatabase,
  createTestPrismaClient,
  describeDatabaseUrl,
  redactSecrets,
  resetTestDatabase,
  resolveTestDatabaseUrl,
} from "../support/test-database";

const checkOnly = process.argv.includes("--check");
let testUrl: string | undefined;

async function ensureDatabaseExists(url: string): Promise<void> {
  // Se conecta a la base de mantenimiento "postgres" del mismo servidor.
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = createTestPrismaClient(adminUrl.toString());

  try {
    const [{ db }] = await admin.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;

    if (db !== "postgres") {
      throw new UnsafeTestDatabaseError(`Se esperaba la base de mantenimiento "postgres" y se obtuvo "${db}".`);
    }

    const [{ total }] = await admin.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM pg_database WHERE datname = ${TEST_DATABASE_NAME}`;

    if (total > 0) {
      console.log(`  La base ${TEST_DATABASE_NAME} ya existe.`);
      return;
    }

    if (checkOnly) {
      console.log(`  La base ${TEST_DATABASE_NAME} no existe (modo --check: no se crea).`);
      return;
    }

    // CREATE DATABASE no admite parámetros; el identificador es una constante validada.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
    console.log(`  Base ${TEST_DATABASE_NAME} creada.`);
  } finally {
    await admin.$disconnect();
  }
}

function runMigrations(url: string): void {
  // La URL viaja por variable de entorno, nunca en la línea de comandos.
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  const output = redactSecrets(`${result.stdout ?? ""}${result.stderr ?? ""}`, url);
  const relevant = output
    .split(/\r?\n/)
    .filter((line) => /Datasource|migration|applied|No pending|error/i.test(line));
  console.log(relevant.map((line) => `  ${line.trim()}`).join("\n"));

  if (result.status !== 0) {
    throw new Error("prisma migrate deploy terminó con error.");
  }
}

async function main(): Promise<void> {
  // Barreras 1 y 2.
  testUrl = resolveTestDatabaseUrl();
  console.log(`Destino validado: ${describeDatabaseUrl(testUrl)}${checkOnly ? " (modo --check)" : ""}`);

  console.log("1. Base de datos");
  await ensureDatabaseExists(testUrl);

  const client = createTestPrismaClient(testUrl);

  try {
    if (checkOnly) {
      // Barrera 3, solo lectura.
      await assertConnectedToTestDatabase(client);
      console.log(`  Conexión verificada: current_database() = ${TEST_DATABASE_NAME}. No se escribió nada.`);
      return;
    }

    console.log("2. Migraciones");
    await assertConnectedToTestDatabase(client);
    runMigrations(testUrl);

    console.log("3. Limpieza");
    await resetTestDatabase(client); // barreras 3 y 4
    console.log(`  Tablas de ${TEST_DATABASE_NAME} vaciadas.`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ABORTADO: ${redactSecrets(message, testUrl, process.env.TEST_DATABASE_URL)}`);
  process.exit(1);
});
