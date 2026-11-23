// In-memory PGlite database for tests, migrated from the generated ./drizzle folder.
// Call closeTestDb(db) in afterEach/afterAll so PGlite instances don't pile up.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { DB } from '@/server/db';
import * as schema from '@/server/db/schema';

export async function createTestDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

export async function seedUser(
  db: DB,
  id: string = randomUUID(),
): Promise<{ id: string; email: string }> {
  const email = `${id}@example.test`;
  await db.insert(schema.user).values({ id, name: `User ${id}`, email });
  return { id, email };
}

/** Closes the PGlite instance behind a db made by createTestDb(). */
export async function closeTestDb(db: DB): Promise<void> {
  await (db as unknown as { $client: PGlite }).$client.close();
}
