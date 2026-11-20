// Protección de la base de pruebas.
//
// Barrera 1: las pruebas solo usan TEST_DATABASE_URL (variable de entorno o .env.test), nunca DATABASE_URL.
// Barrera 2: la URL debe apuntar a una base llamada exactamente cinema_test y no puede
//            coincidir con el DATABASE_URL de desarrollo definido en .env.
// Barrera 3: antes de escribir, SELECT current_database() debe devolver cinema_test.
// Barrera 4: la limpieza ejecuta, en la misma transacción que el TRUNCATE, un bloque SQL
//            que aborta si la base conectada no es cinema_test.
//
// Ningún mensaje de este módulo incluye usuario ni contraseña.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

export const TEST_DATABASE_NAME = "cinema_test";

export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTestDatabaseError";
  }
}

// Los scripts y Vitest se ejecutan desde la raíz del proyecto.
function projectRoot(): string {
  const root = process.cwd();
  const pkgPath = path.join(root, "package.json");

  if (!existsSync(pkgPath)) {
    throw new UnsafeTestDatabaseError("Ejecuta las pruebas desde la raíz del proyecto.");
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };

  if (pkg.name !== "cinema-reservations-api") {
    throw new UnsafeTestDatabaseError("Ejecuta las pruebas desde la raíz de cinema-reservations-api.");
  }

  return root;
}

function readEnvFile(fileName: string): Record<string, string> {
  const filePath = path.join(projectRoot(), fileName);
  return existsSync(filePath) ? parse(readFileSync(filePath)) : {};
}

// Describe una URL sin credenciales: host:puerto/base.
export function describeDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname}:${url.port || "5432"}/${databaseNameOf(url) || "(sin base)"}`;
  } catch {
    return "(URL inválida)";
  }
}

// Sustituye la contraseña (en claro o codificada) por *** en cualquier texto.
export function redactSecrets(text: string, ...urls: (string | undefined)[]): string {
  let result = text;

  for (const raw of urls) {
    if (!raw) continue;

    try {
      const url = new URL(raw);
      for (const secret of [url.password, decodeURIComponent(url.password)]) {
        if (secret) result = result.split(secret).join("***");
      }
    } catch {
      // URL inválida: no hay nada que ocultar.
    }
  }

  return result;
}

function databaseNameOf(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function sameDatabaseTarget(a: URL, b: URL): boolean {
  const host = (u: URL) => (LOCAL_HOSTS.has(u.hostname.toLowerCase()) ? "localhost" : u.hostname.toLowerCase());
  const port = (u: URL) => u.port || "5432";

  return host(a) === host(b) && port(a) === port(b) && databaseNameOf(a) === databaseNameOf(b);
}

// Barrera 2. Es una función pura para poder probarla sin base de datos.
export function assertSafeTestDatabaseUrl(testUrl: string, developmentUrl?: string): void {
  let url: URL;

  try {
    url = new URL(testUrl);
  } catch {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL no es una URL válida.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL debe ser una URL de PostgreSQL.");
  }

  const databaseName = databaseNameOf(url);

  if (databaseName !== TEST_DATABASE_NAME) {
    throw new UnsafeTestDatabaseError(
      `La base de pruebas debe llamarse "${TEST_DATABASE_NAME}"; TEST_DATABASE_URL apunta a "${databaseName || "(vacía)"}".`
    );
  }

  if (developmentUrl) {
    let development: URL | null = null;

    try {
      development = new URL(developmentUrl);
    } catch {
      development = null;
    }

    if (development && sameDatabaseTarget(url, development)) {
      throw new UnsafeTestDatabaseError(
        "TEST_DATABASE_URL apunta a la misma base que DATABASE_URL de desarrollo."
      );
    }
  }
}

// Barreras 1 y 2: obtiene y valida la URL de pruebas.
export function resolveTestDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL || readEnvFile(".env.test").TEST_DATABASE_URL;

  if (!testUrl) {
    throw new UnsafeTestDatabaseError(
      "TEST_DATABASE_URL no está definida. Copia .env.test.example a .env.test y ajústalo."
    );
  }

  assertSafeTestDatabaseUrl(testUrl, readEnvFile(".env").DATABASE_URL);

  return testUrl;
}

export function createTestPrismaClient(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } } });
}

type QueryClient = Pick<PrismaClient, "$queryRaw">;

// Barrera 3: comprobación de solo lectura de la base realmente conectada.
export async function assertConnectedToTestDatabase(client: QueryClient): Promise<void> {
  const rows = await client.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  const connected = rows[0]?.db;

  if (connected !== TEST_DATABASE_NAME) {
    throw new UnsafeTestDatabaseError(
      `La conexión apunta a "${connected ?? "(desconocida)"}" y no a "${TEST_DATABASE_NAME}". Operación cancelada.`
    );
  }
}

// Tablas de la aplicación. No incluye _prisma_migrations.
const APPLICATION_TABLES = [
  "reservation_status_history",
  "reservation_seats",
  "reservations",
  "showtimes",
  "seats",
  "rooms",
  "movies",
] as const;

type ResetClient = Pick<PrismaClient, "$queryRaw" | "$executeRaw" | "$executeRawUnsafe" | "$transaction">;

// Barrera 4 + limpieza. El bloque DO y el TRUNCATE van en la misma transacción:
// si la base no es cinema_test, la excepción revierte todo antes de borrar nada.
export async function resetTestDatabase(client: ResetClient): Promise<void> {
  await assertConnectedToTestDatabase(client);

  await client.$transaction([
    client.$executeRaw`
      DO $$
      BEGIN
        IF current_database() <> 'cinema_test' THEN
          RAISE EXCEPTION 'Protección: la base conectada no es cinema_test';
        END IF;
      END
      $$;
    `,
    client.$executeRawUnsafe(`TRUNCATE TABLE ${APPLICATION_TABLES.join(", ")} RESTART IDENTITY CASCADE`),
  ]);
}
