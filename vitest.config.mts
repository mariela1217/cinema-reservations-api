import { defineConfig } from "vitest/config";

// Las pruebas unitarias no usan base de datos. Si alguna importara Prisma por error,
// esta URL inalcanzable haría fallar la conexión en lugar de llegar a cinema_db.
const UNIT_TESTS_HAVE_NO_DATABASE = "postgresql://unit-tests@127.0.0.1:1/unit_tests_have_no_database";

// Los proyectos con base de datos comparten cinema_test: groupOrder hace que se ejecuten
// uno después del otro (unit → integration → concurrency) y nunca a la vez.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: { DATABASE_URL: UNIT_TESTS_HAVE_NO_DATABASE },
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/db-setup.ts"],
          // Un archivo a la vez: cada uno limpia cinema_test al empezar.
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        test: {
          name: "concurrency",
          include: ["tests/concurrency/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/db-setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
