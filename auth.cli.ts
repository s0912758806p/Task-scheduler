// Config entry for the Better Auth CLI only, e.g.
//   DATABASE_URL=postgres://unused npx @better-auth/cli generate --config auth.cli.ts --output /tmp/auth-schema.ts
// to diff its generated auth tables against src/server/db/schema.ts. The app never imports this
// file. Schema generation does not query the database, but getDb() needs DATABASE_URL to be set.
import { betterAuth } from 'better-auth';
import { buildAuthOptions } from './src/server/auth';
import { getDb } from './src/server/db';

export const auth = betterAuth(buildAuthOptions(process.env, getDb()));
