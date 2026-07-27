import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';

// DATABASE_URL overrides the default local SQLite path.
// Use it when running from a different cwd (e.g. the cli package) or when
// migrating to Turso: DATABASE_URL=libsql://your-db.turso.io?authToken=...
const dbUrl = process.env.DATABASE_URL ?? (() => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return `file:${path.join(dataDir, 'wallet.db')}`;
})();

export const db = createClient({ url: dbUrl });
