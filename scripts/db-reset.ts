import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { dropEverything } from "./lib/reset-database";
import { assertTestDatabase } from "./lib/test-database-guard";

// npm run db:reset: wipes the TEST database, applies every migration and seeds roles and permissions.
// Afterwards: sign up in the app, then npm run admin:promote -- <email>, then copy the shared password hash between accounts (docs/decisions.md §18).

async function main() {
  assertTestDatabase("reset the database");

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: url });
  try {
    console.log("Dropping every table and the migration history...");
    await dropEverything(pool);
    console.log("Applying migrations...");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }

  // Imported only now, after the guard, so nothing connects to the database earlier.
  const { seedBase } = await import("@/server/auth/seed-base");
  const result = await seedBase();
  console.log(
    `Done. Seeded ${result.roles} roles and ${result.permissions} permission keys (${result.grantsAdded} default grants).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
