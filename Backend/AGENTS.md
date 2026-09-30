# Media Navigator API — agent notes

Node.js 24 + TypeScript + Express 5 + Mongoose 9 (MongoDB). Deployed to Render; files in Cloudflare R2
through its S3 API. Read `README.md` for setup and `docs/MIGRATION_REPORT.md` for history.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local server with reload on http://0.0.0.0:8787 (reads `.env`) |
| `npm run typecheck` | Type-check `src/`, `scripts/` and `tests/` |
| `npm test` | Vitest + supertest against the local MongoDB (throwaway database per test file) |
| `npm run build` / `npm start` | Production build to `dist/` and start (Render) |
| `npm run migrate:d1` | One-time, idempotent import of the old Worker's local D1/KV state |

Run typecheck and tests before declaring a task done.

## Rules

- Keep the response envelope `{ success, data }` / `{ success, error: { code, message, fields? } }` and existing paths: the mobile app depends on them.
- Never return, log, or send to Gemini: passwords, password hashes, session tokens, platform access/refresh tokens, `ENCRYPTION_KEY`, `MONGODB_URI`, R2 or Gemini keys. Platform tokens are stored only through `services/credentials.ts` (AES-256-GCM).
- A metric a platform did not return is `null`, never `0`. Never invent metrics, seed data or demo accounts.
- Every query on user data must be scoped to the authenticated user (`requireOwnedAccount`, `userId` filters).
- 401 means "session invalid" to the app (it signs out). Use 403 for a wrong password on an authenticated request.
- Platform adapters live in `src/services/providers/` and must use official, documented APIs. Check the platform's current docs before changing request shapes; do not rely on memory.
