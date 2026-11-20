import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UnsafeTestDatabaseError,
  assertConnectedToTestDatabase,
  assertSafeTestDatabaseUrl,
  describeDatabaseUrl,
  redactSecrets,
  resetTestDatabase,
  resolveTestDatabaseUrl,
} from "../support/test-database";

const DEV = "postgresql://user:s3cr%40t@localhost:5433/cinema_db?schema=public";
const TEST = "postgresql://user:s3cr%40t@localhost:5433/cinema_test?schema=public";

describe("Barrera 2: validación de la URL de pruebas", () => {
  it("acepta cinema_test en el mismo servidor que desarrollo", () => {
    expect(() => assertSafeTestDatabaseUrl(TEST, DEV)).not.toThrow();
  });

  it.each([
    ["cinema_db", "postgresql://u:p@localhost:5433/cinema_db"],
    ["base vacía", "postgresql://u:p@localhost:5433/"],
    ["otro nombre", "postgresql://u:p@localhost:5433/cinema_test_copy"],
    ["mayúsculas", "postgresql://u:p@localhost:5433/CINEMA_TEST"],
    ["base postgres", "postgresql://u:p@localhost:5433/postgres"],
  ])("rechaza una base distinta de cinema_test (%s)", (_name, url) => {
    expect(() => assertSafeTestDatabaseUrl(url, DEV)).toThrow(UnsafeTestDatabaseError);
  });

  it("rechaza protocolos que no son PostgreSQL y URLs inválidas", () => {
    expect(() => assertSafeTestDatabaseUrl("mysql://u:p@localhost/cinema_test")).toThrow(UnsafeTestDatabaseError);
    expect(() => assertSafeTestDatabaseUrl("no es una url")).toThrow(UnsafeTestDatabaseError);
  });

  it("rechaza la misma base que desarrollo aunque cambie la forma de escribir el host", () => {
    const dev = "postgresql://u:p@127.0.0.1:5433/cinema_test";
    expect(() => assertSafeTestDatabaseUrl("postgresql://otro:x@localhost:5433/cinema_test", dev)).toThrow(/misma base/);
  });

  it("no incluye credenciales en los mensajes de error", () => {
    try {
      assertSafeTestDatabaseUrl(DEV, DEV);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toMatch(/s3cr|user/);
    }
  });
});

describe("Barrera 1: resolveTestDatabaseUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rechaza TEST_DATABASE_URL dirigida a cinema_db antes de conectar", () => {
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://u:p@localhost:5433/cinema_db");
    expect(() => resolveTestDatabaseUrl()).toThrow(UnsafeTestDatabaseError);
  });

  it("ignora DATABASE_URL: no la usa como respaldo", () => {
    vi.stubEnv("DATABASE_URL", TEST);
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://u:p@localhost:5433/cinema_db");
    expect(() => resolveTestDatabaseUrl()).toThrow(UnsafeTestDatabaseError);
  });
});

describe("Utilidades sin secretos", () => {
  it("describe la URL sin usuario ni contraseña", () => {
    expect(describeDatabaseUrl(TEST)).toBe("localhost:5433/cinema_test");
    expect(describeDatabaseUrl("basura")).toBe("(URL inválida)");
  });

  it("oculta la contraseña en claro y codificada", () => {
    const text = "fallo con s3cr@t y s3cr%40t";
    expect(redactSecrets(text, TEST)).toBe("fallo con *** y ***");
  });
});

function fakeClient(currentDatabase: string) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ db: currentDatabase }]),
    $executeRaw: vi.fn().mockReturnValue("guard"),
    $executeRawUnsafe: vi.fn().mockReturnValue("truncate"),
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

describe("Barrera 3: base realmente conectada", () => {
  it("acepta cinema_test", async () => {
    await expect(assertConnectedToTestDatabase(fakeClient("cinema_test") as never)).resolves.toBeUndefined();
  });

  it("rechaza cinema_db", async () => {
    await expect(assertConnectedToTestDatabase(fakeClient("cinema_db") as never)).rejects.toThrow(UnsafeTestDatabaseError);
  });
});

describe("Barrera 4: limpieza protegida", () => {
  it("no prepara ni ejecuta el TRUNCATE si la conexión es cinema_db", async () => {
    const client = fakeClient("cinema_db");
    await expect(resetTestDatabase(client as never)).rejects.toThrow(UnsafeTestDatabaseError);
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("ejecuta la guardia SQL y el TRUNCATE en una sola transacción, en ese orden", async () => {
    const client = fakeClient("cinema_test");
    await resetTestDatabase(client as never);

    expect(client.$transaction).toHaveBeenCalledWith(["guard", "truncate"]);
    const guardSql = (client.$executeRaw.mock.calls[0][0] as string[]).join("");
    expect(guardSql).toMatch(/current_database\(\) <> 'cinema_test'/);
    expect(guardSql).toMatch(/RAISE EXCEPTION/);

    const truncateSql = client.$executeRawUnsafe.mock.calls[0][0] as string;
    expect(truncateSql).toMatch(/^TRUNCATE TABLE /);
    expect(truncateSql).not.toMatch(/_prisma_migrations/);
  });
});
