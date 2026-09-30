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

---

## Part 2 — Migration result (September 30, 2026)

### New architecture

| Layer | Implementation |
| --- | --- |
| HTTP | Express 5 (`src/app.ts`), Helmet, CORS allow-list (no credentials), per-IP rate limits (API 300/min, auth 30/15 min), 16 KB JSON limit, JSON 404/405 |
| Config | `src/config/env.ts` (Zod). Production refuses a localhost/LAN `MONGODB_URI` or an `ENCRYPTION_KEY` shorter than 32 characters |
| Data | Mongoose models in `src/models`, repositories in `src/db` returning the same row shapes the services used before |
| Credentials | AES-256-GCM, key = SHA-256(`ENCRYPTION_KEY`), identical to the Worker, so the migrated credential decrypts unchanged |
| Providers | `src/services/providers`: Instagram (original sync), Facebook Pages, YouTube, LinkedIn |
| Files | Cloudflare R2 via `@aws-sdk/client-s3` (`region: auto`), metadata in `files` |
| Server | `src/server.ts` listens on `0.0.0.0:$PORT` (default 8787), graceful SIGTERM shutdown |

### MongoDB collections

`users`, `profiles`, `sessions`, `connected_accounts`, `platform_credentials`, `content_items`,
`account_insights`, `sync_runs`, `ai_cache` (TTL), `ai_questions`, `ai_usage` (TTL), `oauth_states` (TTL),
`pending_connections` (TTL), `notifications`, `files`.

Indexes include `users.email` (unique), `sessions.tokenHash` (unique), `sessions.userId`,
`sessions.expiresAt` (TTL, 7-day grace), `connected_accounts (userId, platform, platformAccountId)` (unique),
`connected_accounts (platform, platformAccountId)`, `connected_accounts.tokenReference` (unique),
`content_items (connectedAccountId, platformContentId)` (unique) and `content_items (connectedAccountId, publishedAt)`.

### D1/KV → MongoDB migration (local data, `npm run migrate:d1`)

Backup: `.migration-backups/2026-09-30T05-32-32-435Z/` (raw `.wrangler/state` + JSON export, gitignored).

| Data | D1/KV | MongoDB | Notes |
| --- | --- | --- | --- |
| users | 1 | 1 | |
| profiles | 1 | 1 | |
| sessions | 2 | 1 | 1 active session migrated; 1 revoked/expired session intentionally skipped |
| connected accounts | 1 | 1 | Instagram `@svnbayparck` |
| platform credentials (KV) | 1 | 1 | decrypts with the existing `ENCRYPTION_KEY` |
| Instagram media → `content_items` | 201 | 201 | 201/201 field-identical; null metrics kept null |
| Instagram insights → `account_insights` | 3 | 3 | |
| sync runs | 5 | 5 | |
| AI cache (KV) | 3 | 3 | real Gemini results, still within their TTL |
| Ask history (KV) | 0 | 0 | none existed |
| OAuth states / rate counters (KV) | 5 | — | temporary and expired, not migrated |

Analytics parity: the baseline computed from D1 rows equals the one computed from MongoDB rows
(mean 594.35, median 8, n = 201). A second run inserted nothing and skipped everything (idempotent).

### Live verification after the cut-over (Node server on :8787, real data)

* `/health` → `{ status: ok, database: connected }`.
* Every read endpoint returned 200 with the migrated data (Home: 5,035 followers, 0.66% engagement over
  the latest 50; Intelligence: 201 posts, 66 reels, timing sufficient). No response contained a token,
  credential reference or key.
* **Real Meta sync** through the new server: 200 items and 3 profile metrics in about 31 s; view counts updated.
* **Real Gemini (`gemini-3.5-flash`)**: executive insights (4), top-post diagnosis, Needs Attention
  diagnosis and Ask Media Navigator all returned 200 (9–22 s each). The verification question was
  removed from the Ask history afterwards.
* Notifications created by those real events: "Instagram sync completed", "New AI insights are ready".

### Endpoint matrix

| Endpoint | Method | Auth | Request | Response `data` | Collections | External | Verified |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/health` | GET | no | — | `status, database` | ping | — | tests + live |
| `/api/auth/signup` | POST | no | `email, password, displayName` | `user, session` | users, profiles, sessions | — | tests |
| `/api/auth/login` | POST | no | `email, password` | `user, session` | users, sessions | — | tests |
| `/api/auth/logout` | POST | yes | — | `null` | sessions | — | tests |
| `/api/auth/me` | GET | yes | — | `user` | users, profiles | — | tests + live |
| `/api/auth/forgot-password` | POST | no | `email` | 501 (no email provider) | — | — | tests |
| `/api/auth/sessions` | GET | yes | — | `activeSessions` | sessions | — | tests |
| `/api/auth/change-password` | POST | yes | `currentPassword, newPassword` | `otherSessionsRevoked` | users, sessions | — | tests |
| `/api/auth/logout-others` | POST | yes | — | `otherSessionsRevoked` | sessions | — | tests |
| `/api/auth/delete-account` | POST | yes | `password` | `deleted` | all user data (+ R2) | R2 | tests |
| `/api/overview` | GET | yes | — | `accounts, heroSignal, channels, insights` | accounts, content, insights | — | tests + live |
| `/api/accounts` | GET | yes | — | `accounts` | connected_accounts | — | tests + live |
| `/api/accounts/connect` | POST | yes | `platform, accessToken?` | `account` / `selection` / `authorizationUrl` | accounts, credentials | Meta | tests (Meta mocked) |
| `/api/accounts/connect/:platform` | GET | yes | `returnUrl?` | `authorizationUrl` | oauth_states | — | tests |
| `/api/accounts/callback/:platform` | GET | no (state) | `code, state` | 302 to the app deep link | oauth_states, accounts, credentials | Meta / Google / LinkedIn | tests (mocked) |
| `/api/accounts/pending/:id` | GET | yes | — | `selection` | pending_connections | — | tests |
| `/api/accounts/pending/:id/select` | POST | yes | `platformAccountId` | `account` | pending_connections, accounts | platform | tests (mocked) |
| `/api/accounts/:id` | DELETE | yes | — | `message` | accounts + cascade | — | tests |
| `/api/accounts/:id/sync` | POST | yes | — | `accountId, postsSynced, metricsSynced, lastSyncedAt` | content, insights, sync_runs, notifications | platform | tests + **live Meta** |
| `/api/accounts/:id/dashboard` | GET | yes | — | `account, metrics, posts (latest 50), lastSyncRun` | accounts, content, insights | — | tests + live |
| `/api/intelligence/overview` | GET | yes | `accountId?, tz?` | `accounts, overview` | content, insights, sync_runs | — | tests + live |
| `/api/intelligence/insights` | GET | yes | `accountId?, tz?` | `insights, generatedAt` | ai_cache, ai_usage | Gemini | tests + **live Gemini** |
| `/api/intelligence/media` | GET | yes | `accountId, q, format, sort, period, performance, limit, offset` | `items, total, nextOffset` | content | — | tests + live |
| `/api/intelligence/media/:id` | GET | yes | `accountId?, tz?` | post detail | content | — | tests + live |
| `/api/intelligence/media/:id/analysis` | GET | yes | `accountId?, tz?` | post analysis | ai_cache | Gemini | tests + **live Gemini** |
| `/api/intelligence/ask` | GET | yes | `accountId?` | `history, aiConfigured` | ai_questions | — | tests + live |
| `/api/intelligence/ask` | POST | yes | `question, accountId?, tz?` | answer | ai_questions, ai_usage | Gemini | tests + **live Gemini** |
| `/api/planner/insights` | GET | yes | `tz?, accountId?` | timing + `account, accounts, scheduling` | content | — | tests + live |
| `/api/notifications` | GET | yes | — | `notifications, unreadCount` | notifications | — | tests + live |
| `/api/notifications/read` | POST | yes | `ids?` | `updated` | notifications | — | tests |
| `/api/profile` | PATCH | yes | `displayName` | `user` | profiles | — | tests |
| `/api/profile/preferences` | GET / PATCH | yes | preference fields | `preferences` | users | — | tests |
| `/api/profile/avatar/upload-url` | POST | yes | `mimeType, size` | presigned PUT | files | R2 | tests (stand-in client) |
| `/api/profile/avatar/confirm` | POST | yes | `fileId` | `avatarKey, user` | files, profiles | R2 | tests (stand-in client) |
| `/api/profile/avatar` | GET / DELETE | yes | — | `url` / `user` | profiles, files | R2 | tests |

All pre-existing paths, methods and response shapes are unchanged. Existing responses only gained new
optional fields (`insights[].platform/accountId`, planner `account/accounts/scheduling`, notifications
`unreadCount`).

### Status by area

| Area | Status |
| --- | --- |
| Instagram | Working against the real account through the new backend (sync verified live). |
| Facebook Pages | Implemented (OAuth and manual Meta token, Page selection, posts, reactions/comments/shares, reach where Meta returns it). **Not tested against the live API**: no Meta app credentials are configured. |
| YouTube | Implemented (Google OAuth with PKCE, refresh tokens, channel selection, videos, views/likes/comments, watch time via YouTube Analytics). **Not tested against the live API**: no Google OAuth client is configured. |
| LinkedIn | Implemented (organization ACLs, posts, reactions/comments, share statistics). **Not tested against the live API**: needs an app approved for the Community Management API. |
| R2 | Implemented (presigned upload/download, verify-on-confirm, delete). **Not tested against a real bucket**: no R2 credentials are configured, so upload endpoints answer 503 until they are. |
| Render | `render.yaml` and the production build/start verified locally. **Not deployed.** Production needs a remotely reachable MongoDB (for example Atlas). |

### Remaining limitations

* Home has an "All" / per-platform filter, but Intelligence and Planner analyze one account at a time
  (account switcher); metrics from different platforms are not merged into one baseline.
* OAuth flows need HTTPS callback URLs registered with each platform, so they can only be exercised on a
  deployed backend or through an HTTPS tunnel.
* YouTube Shorts are stored as `VIDEO` (the Data API has no reliable Shorts flag). LinkedIn post
  thumbnails are not resolved (image URNs need an extra API call).
* Rate limiting uses in-memory counters per instance; running several instances would need a shared store.
* Password reset still needs an email provider (the endpoint answers 501 truthfully).
* The mobile app has no avatar-upload UI yet (the backend is ready; it needs an image picker and R2 credentials).
* The Privacy Policy and Terms texts describe the actual data handling but have not been legally reviewed.
