/**
 * Replaces everything in a hosted Postgres database (DATABASE_URL) with the contents of a local
 * PGlite database (PGLITE_DIR). Used to load demo data that was generated locally, because posting
 * thousands of documents over a long-distance connection is slow.
 *
 * The target must already have the same schema (run `drizzle-kit push` against it first). All of
 * it runs in one transaction: foreign keys are dropped, tables emptied and refilled, then the
 * foreign keys are re-created (which re-validates every row). Any error rolls the target back.
 *
 *   PGLITE_DIR=... DATABASE_URL=... tsx scripts/copy-to-postgres.ts --yes
 */
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";

async function main() {
  const dir = process.env.PGLITE_DIR;
  const url = process.env.DATABASE_URL;
  if (!dir || !url) throw new Error("Set PGLITE_DIR (source) and DATABASE_URL (target)");
  if (!process.argv.includes("--yes")) throw new Error("This replaces ALL data in the target database. Re-run with --yes.");

  const src = new PGlite(dir);
  const pool = new Pool({ connectionString: url });
  const dst = await pool.connect();
  const ident = (n: string) => `"${n.replaceAll('"', '""')}"`;

  try {
    const tables = (await src.query<{ t: string }>(`select tablename t from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.t);
    const targetTables = new Set((await dst.query(`select tablename t from pg_tables where schemaname = 'public'`)).rows.map((r: { t: string }) => r.t));
    const missing = tables.filter((t) => !targetTables.has(t));
    if (missing.length) throw new Error(`Target is missing tables: ${missing.join(", ")} (push the schema first)`);

    await dst.query("begin");
    const fks = (
      await dst.query(
        `select conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`
      )
    ).rows as { tbl: string; conname: string; def: string }[];
    for (const fk of fks) await dst.query(`alter table ${fk.tbl} drop constraint ${ident(fk.conname)}`);
    await dst.query(`truncate ${tables.map(ident).join(", ")}`);

    let total = 0;
    for (const t of tables) {
      const { rows } = await src.query<{ j: string }>(`select coalesce(json_agg(x), '[]')::text j from ${ident(t)} x`);
      const all = JSON.parse(rows[0].j) as unknown[];
      for (let i = 0; i < all.length; i += 2000) {
        const chunk = JSON.stringify(all.slice(i, i + 2000));
        await dst.query(`insert into ${ident(t)} select * from json_populate_recordset(null::${ident(t)}, $1::json)`, [chunk]);
      }
      total += all.length;
      if (all.length) console.log(`${t.padEnd(28)} ${all.length}`);
    }

    for (const fk of fks) await dst.query(`alter table ${fk.tbl} add constraint ${ident(fk.conname)} ${fk.def}`);

    // Keep any serial/identity sequences ahead of the copied ids
    const seqs = (
      await dst.query(
        `select table_name t, column_name c, pg_get_serial_sequence(quote_ident(table_name), column_name) s from information_schema.columns where table_schema = 'public' and pg_get_serial_sequence(quote_ident(table_name), column_name) is not null`
      )
    ).rows as { t: string; c: string; s: string }[];
    for (const q of seqs) await dst.query(`select setval('${q.s}', coalesce((select max(${ident(q.c)}) from ${ident(q.t)}), 0) + 1, false)`);

    await dst.query("commit");
    console.log(`Copied ${total} rows across ${tables.length} tables; ${fks.length} foreign keys re-created${seqs.length ? `, ${seqs.length} sequences reset` : ""}.`);
  } catch (e) {
    await dst.query("rollback").catch(() => {});
    throw e;
  } finally {
    dst.release();
    await pool.end();
    await src.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
