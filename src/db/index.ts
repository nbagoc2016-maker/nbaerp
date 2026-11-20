import "server-only";
import { createDb, type DB } from "./client";

export type { DB, Tx, DbOrTx } from "./client";
export { schema } from "./client";

// One embedded Postgres per server process, opened on first use (not at import, so `next build`
// workers never touch the data directory). Kept on globalThis so dev hot reloads reuse it, since
// PGlite holds an exclusive lock on its data directory.
const globalForDb = globalThis as unknown as { __shusuiDb?: DB };

function getDb(): DB {
  return (globalForDb.__shusuiDb ??= createDb().db);
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
