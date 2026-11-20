import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load .env.local if present, then fall back to standard environment variables
config({ path: ".env.local" });

// Hosted Postgres when DATABASE_URL is set (e.g. Supabase), otherwise the local
// embedded PGlite database.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default url
  ? defineConfig({
      dialect: "postgresql",
      schema: "./src/db/schema/index.ts",
      out: "./drizzle",
      dbCredentials: { url },
    })
  : defineConfig({
      dialect: "postgresql",
      driver: "pglite",
      schema: "./src/db/schema/index.ts",
      out: "./drizzle",
      dbCredentials: {
        url: process.env.PGLITE_DIR ?? "./.data/pglite",
      },
    });
