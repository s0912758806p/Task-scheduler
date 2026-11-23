// Database access. `getDb()` lazily creates a Neon Pool-backed Drizzle instance on
// first call and caches it; importing this module never throws (so `next build`
// works without DATABASE_URL). `DB` is the driver-agnostic type so services can
// run against Neon in production and PGlite in tests.
import { neonConfig, Pool } from '@neondatabase/serverless';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: DB | undefined;

export function getDb(): DB {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Node has no global WebSocket constructor the Neon driver can use.
  neonConfig.webSocketConstructor = ws;
  cached = drizzle(new Pool({ connectionString: url }), { schema });
  return cached;
}
