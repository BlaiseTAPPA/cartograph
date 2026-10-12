import { existsSync } from "node:fs";
import { join } from "node:path";

// Imported first by every script that runs outside the web app, so it sees
// the environment `next dev` sees: the same files, in Next's order. Earlier
// files win, and anything already set in the shell wins over all of them, as
// in Next. Modules evaluate their imports in order, so importing this before
// anything that reads `process.env` at load (lib/env.ts, the model client) is
// enough.

const root = join(import.meta.dirname, "..");

for (const name of [".env.development.local", ".env.local", ".env.development", ".env"]) {
  const file = join(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}
