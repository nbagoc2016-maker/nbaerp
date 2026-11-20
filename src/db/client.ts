import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import path from "node:path";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;
// A transaction handle has the same query API; services accept either.
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

export const defaultDataDir = () => process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");

/**
 * Opens the database.
 * - With DATABASE_URL set (Supabase / hosted Postgres): uses postgres.js connection.
 *   prepare: false is configured to ensure compatibility with Supabase's transaction connection pooler.
 * - Otherwise: the embedded PGlite database in .data/pglite (local development, scripts, tests).
 */
export function createDb(dataDir?: string): { db: DB; client: { close(): Promise<void> } } {
  const url = dataDir ? undefined : process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { prepare: false });
    const db = drizzlePostgres(client, { schema }) as unknown as DB;
    return { db, client: { close: () => client.end() } };
  }
  const client = new PGlite(dataDir ?? defaultDataDir());
  return { db: drizzlePglite(client, { schema }), client };
}

export { schema };
