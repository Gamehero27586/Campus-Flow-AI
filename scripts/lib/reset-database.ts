// Empties a database completely: every table, enum, function and trigger, and drizzle's own
// migration history. Used by npm run db:reset (test database only; see test-database-guard.ts).
// Needed because audit_logs is append-only, so test data that includes audited actions cannot be
// deleted row by row. Dropping the schema is the one supported way to start over.

export const RESET_STATEMENTS = [
  "DROP SCHEMA IF EXISTS drizzle CASCADE",
  "DROP SCHEMA IF EXISTS public CASCADE",
  "CREATE SCHEMA public",
] as const;

type Queryable = { query: (sql: string) => Promise<unknown> };

export async function dropEverything(client: Queryable): Promise<void> {
  for (const statement of RESET_STATEMENTS) {
    await client.query(statement);
  }
}
