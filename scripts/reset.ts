// Deletes the local embedded database so db:push + db:seed can rebuild it from scratch.
import { rmSync } from "node:fs";
import path from "node:path";

const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}`);
