// Se ejecuta antes de cada archivo de las suites con base de datos.
// Fija DATABASE_URL a la base de pruebas ANTES de que cualquier prueba importe la app,
// de modo que el cliente de Prisma de src/lib/prisma.ts nunca vea otra URL.
import { afterAll, beforeAll } from "vitest";
import { assertConnectedToTestDatabase, resolveTestDatabaseUrl } from "./test-database";

process.env.DATABASE_URL = resolveTestDatabaseUrl();

beforeAll(async () => {
  const { prisma } = await import("../../src/lib/prisma");
  await assertConnectedToTestDatabase(prisma);
});

afterAll(async () => {
  const { prisma } = await import("../../src/lib/prisma");
  await prisma.$disconnect();
});
