# Media Navigator backend migration report

Cloudflare Worker (D1 + KV + R2 binding) → Node.js + Express + MongoDB + Cloudflare R2 (S3 API).

This document has two parts: the **pre-migration inventory** (written before any code changed, from
reading the actual files at commit `f3c6137`) and the **migration result** (appended at the end).

---

## Part 1 — Pre-migration inventory (commit f3c6137)

### Runtime and tooling

| Item | Value |
| --- | --- |
| Runtime | Cloudflare Workers (`wrangler dev` on :8787), `compatibility_date` 2026-09-25 |
| Entry | `src/index.ts` — hand-written router, `fetch(request, env, ctx)` |
| Bindings | `DB` (D1), `CACHE` (KV), `MEDIA_BUCKET` (R2, **declared but never used in code**) |
| Vars | `CORS_ALLOWED_ORIGINS`, `META_API_VERSION` (v21.0), `GEMINI_MODEL` (gemini-3.5-flash) |
| Secrets | `GEMINI_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `ENCRYPTION_KEY` |
| Local secrets present in `.dev.vars` | `ENCRYPTION_KEY`, `GEMINI_API_KEY` only (no Meta app credentials) |
| Tests | Vitest + `@cloudflare/vitest-plugin` (runs inside workerd), 54 cases in 5 files |

### API routes (src/index.ts)

| Method | Path | Auth | Handler |
| --- | --- | --- | --- |
| GET | `/health` | no | liveness only, touches no storage |
| POST | `/api/auth/signup` | no | user + profile + session in one D1 batch |
| POST | `/api/auth/login` | no | PBKDF2 verify, timing-equalized for unknown emails |
| POST | `/api/auth/logout` | yes | revokes current session only |
| GET | `/api/auth/me` | yes | public user (id, email, profile) |
| POST | `/api/auth/forgot-password` | no | honest 501 (no email provider) |
| GET | `/api/accounts` | yes | connected accounts |
| GET | `/api/accounts/connect/instagram` | yes | Meta OAuth URL + KV state |
| POST | `/api/accounts/connect` | yes | **manual Meta token** connect ("Option A", the path the app uses) |
| GET | `/api/accounts/callback/instagram` | no | Meta OAuth callback → deep link |
| DELETE | `/api/accounts/:id` | yes | deletes KV credential + D1 row |
| POST | `/api/accounts/:id/sync` | yes | Instagram sync (profile, account insights, ≤200 media + inline insights) |
| GET | `/api/accounts/:id/dashboard` | yes | latest-50 dashboard |
| GET | `/api/intelligence/overview` | yes | full-population analytics |
| GET | `/api/intelligence/insights` | yes | Gemini executive insights (KV cached per sync) |
| GET | `/api/intelligence/media` | yes | paginated/filtered content library |
| GET | `/api/intelligence/media/:id` | yes | post detail + measured comparisons |
| GET | `/api/intelligence/media/:id/analysis` | yes | Gemini post diagnosis (KV cached) |
| GET | `/api/intelligence/ask` | yes | ask history (KV) |
| POST | `/api/intelligence/ask` | yes | Gemini answer from account data |
| GET | `/api/overview` | yes | Home: channels + quick insights (latest 50) |
| GET | `/api/planner/insights` | yes | measured timing heatmap/windows |
| GET | `/api/notifications` | yes | **501 — not built** |

Response envelope everywhere: `{ success: true, data }` / `{ success: false, error: { code, message, fields? } }`,
`Cache-Control: no-store`.

### Authentication and sessions

* Passwords: PBKDF2-HMAC-SHA256, 100,000 iterations (Workers maximum), 16-byte salt, self-describing
  string `pbkdf2-sha256$<iter>$<salt>$<hash>`. Never returned.
* Sessions: 32 random bytes, base64url (43 chars); only `sha256(token)` stored in `sessions.token_hash`.
  TTL 30 days, `last_used_at` touched at most once a minute, `revoked_at` on logout.
* Bearer token in `Authorization`; errors `AUTH_REQUIRED`, `INVALID_SESSION`, `SESSION_EXPIRED`.

### D1 schema (migrations 0001–0004) and local data

| Table | Purpose | Local rows |
| --- | --- | --- |
| `users` | email (unique, normalized), password_hash | 1 |
| `profiles` | display_name, avatar_key (R2 key, always NULL) | 1 |
| `sessions` | token_hash (unique), expires/revoked | 2 (1 active) |
| `connected_accounts` | platform, platform_account_id, token_reference (unique), status, last_synced_at | 1 (`instagram` / `svnbayparck`) |
| `instagram_media` | media fields + like/comment counts + views/reach/saved/shares/total_interactions (NULL = not available) | 201 |
| `instagram_insights` | profile metrics (followers/follows/media_count) + account insights | 3 |
| `instagram_sync_runs` | sync history | 5 |

IDs are UUIDv4 strings; timestamps are epoch milliseconds; media `timestamp` is Meta's raw string
(`2026-09-25T10:00:00+0000`).

### KV usage, categorized

| Key pattern | Category | Plan |
| --- | --- | --- |
| `credentials:{userId}:{tokenReference}` | **A. OAuth credential** (AES-256-GCM, key = SHA-256(ENCRYPTION_KEY), 12-byte IV) | Move ciphertext as-is to MongoDB `platform_credentials` (no decryption needed; same scheme in Node) |
| `oauth_state:{state}` (10 min TTL) | C. temporary state | MongoDB `oauth_states` with TTL index; existing entries are expired and are not migrated |
| `ai:v1:insights:*`, `ai:v1:post:*` (7 day TTL) | B. cache (real Gemini output) | MongoDB `ai_cache` with TTL index; live entries migrated |
| `ai:v1:asks:{userId}:{accountId}` | D. persisted history | MongoDB `ai_questions` (none exist locally) |
| `ai:v1:rate:{userId}:{hour}` | C. rate-limit counter | MongoDB `ai_usage` with TTL; not migrated (expired) |

### Services

* `services/instagram.ts` — OAuth URL/state, code exchange (short → long-lived), account discovery via
  `/me/accounts{instagram_business_account}` with Instagram-Login fallback.
* `services/instagramSync.ts` — profile + account insights + paginated media with inline insight field
  expansion and a step-down chain of metric sets. Missing metrics stored as NULL.
* `services/intelligence.ts` — pure analytics: format classification, baseline (mean + median), format
  performance, archive, ranking (min 6), Needs Attention (older than 3 days, below mean), timing
  (min 30 posts, 3-hour buckets, min 2 per cell / 3 per window).
* `services/intelligenceSnapshot.ts` — builds the snapshot from all synced rows (≤1000).
* `services/aiIntelligence.ts` + `services/gemini.ts` — sanitized context, structured output, evidence
  rebuilt from stored numbers, 40 AI calls/user/hour.
* Populations: Home / dashboard = latest 50 posts; Intelligence = all synced posts.

### Frontend contract

* `Frontend/src/lib/api/client.ts` — only needs `EXPO_PUBLIC_API_BASE_URL`; bearer token from SecureStore.
* Types in `Frontend/src/types/api.ts`; every endpoint above is called by `src/features/*/api.ts`.
* Unfinished UI: Profile → Security / Preferences / Help / Privacy / Terms show "Not available yet";
  Notifications screen renders the 501 as "No notifications yet."; Planner says scheduling is not available.
* No frontend secret exposure found: the only `EXPO_PUBLIC_*` variable is the API base URL.

### Migration plan

1. Keep every path, method, request body and response shape. The app changes only `EXPO_PUBLIC_API_BASE_URL`.
2. Keep the existing module boundaries (`routes/`, `services/`, `db/` as the repository layer,
   `lib/`, `middleware/`), swapping D1/KV implementations for Mongoose.
3. Keep UUID string IDs as MongoDB `_id` so account and post IDs the app already knows stay valid.
4. Keep PBKDF2 hashes verifiable (new hashes use a higher iteration count; the format is self-describing).
5. Keep the credential encryption scheme so the migrated Meta credential decrypts with the existing key.
6. Migrate D1 rows and live KV entries with an idempotent script, verify counts, then remove Worker code.
