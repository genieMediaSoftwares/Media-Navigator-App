import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Builds the schema from migrations/ in the test runtime's local D1. No rows are inserted.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
