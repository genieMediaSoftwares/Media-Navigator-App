# Media Navigator API

Node.js + Express + MongoDB backend for the Media Navigator mobile app.

```
React Native (Expo)  ──HTTPS──▶  Node.js + Express (this folder)
                                   ├── MongoDB        users, sessions, accounts, content, analytics, AI cache
                                   ├── Cloudflare R2  uploaded files (profile photos) via the S3 API
                                   ├── Meta / Google / LinkedIn APIs   (server-side only)
                                   └── Gemini API     sanitized analytics only
```

## Local development

Prerequisites: Node.js 24, a local **MongoDB server** running on `127.0.0.1:27017` (on Windows the
"MongoDB Server" service). MongoDB Compass is only a viewer: connect it to
`mongodb://127.0.0.1:27017` and open the `media_navigator` database to inspect data.

```bash
cd Backend
cp .env.example .env         # then fill in ENCRYPTION_KEY, GEMINI_API_KEY, …
npm install
npm run dev                  # http://0.0.0.0:8787
curl http://127.0.0.1:8787/health
# → {"success":true,"data":{"status":"ok","database":"connected"}}
```

### Testing on a physical iPhone

1. Phone and computer on the same Wi-Fi. Find the computer's LAN IP (`ipconfig` → IPv4, e.g. `192.168.0.9`).
2. Allow inbound TCP 8787 in the Windows firewall for Node.js if the phone cannot reach it.
3. In `Frontend/.env`: `EXPO_PUBLIC_API_BASE_URL=http://192.168.0.9:8787`
4. `cd Frontend && npx expo start -c`, open in Expo Go.

OAuth sign-in (Facebook, YouTube, LinkedIn, Instagram OAuth) needs HTTPS redirect URIs registered with
each platform, so it only works against a deployed HTTPS backend (Render) or an HTTPS tunnel. The
Instagram and Facebook manual-token connections work locally.

## Environment variables

All are server-side. None of them may be put in an `EXPO_PUBLIC_*` variable. See `.env.example`.

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | yes | Local: `mongodb://127.0.0.1:27017/media_navigator`. Production: a remotely reachable deployment (MongoDB Atlas). The server refuses to start in production with a localhost/LAN URI. |
| `ENCRYPTION_KEY` | yes | ≥ 32 characters in production. Encrypts platform tokens. **Changing it makes stored platform credentials unreadable** — keep the value the old Worker used so migrated credentials keep working. |
| `PORT`, `HOST` | no | Default `8787`, `0.0.0.0`. Render sets `PORT`. |
| `NODE_ENV` | no | `development` / `production` / `test`. |
| `TRUST_PROXY` | no | `1` on Render. |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated browser origins (Expo web only). |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | for AI | Model default `gemini-3.5-flash`. Without a key AI endpoints answer 503 `AI_UNAVAILABLE`. |
| `META_APP_ID`, `META_APP_SECRET`, `META_API_VERSION` | for Meta OAuth | Instagram + Facebook Pages. |
| `META_REDIRECT_URI` | Instagram OAuth | `https://<api-host>/api/accounts/callback/instagram` |
| `FACEBOOK_REDIRECT_URI` | Facebook OAuth | `https://<api-host>/api/accounts/callback/facebook` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | YouTube | Enable YouTube Data API v3 and YouTube Analytics API. Redirect `…/api/accounts/callback/youtube`. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`, `LINKEDIN_API_VERSION` | LinkedIn | App with Community Management API access. Redirect `…/api/accounts/callback/linkedin`. |
| `APP_REDIRECT_SCHEMES` | no | Deep-link schemes the OAuth callback may return to. Default `medianavigator,exp`. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` | for uploads | Endpoint defaults to `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`. Without them upload endpoints answer 503 `STORAGE_NOT_CONFIGURED`. |
| `AUTH_RATE_LIMIT`, `API_RATE_LIMIT`, `AI_REQUESTS_PER_HOUR` | no | Defaults 30 / 15 min, 300 / min, 40 / hour. |

## Deploying to Render

`render.yaml` at the repository root is a Render Blueprint for this folder.

1. Create a MongoDB Atlas cluster (or another remotely reachable MongoDB), a database user, and allow
   Render's outbound IPs (or `0.0.0.0/0` with a strong password). Copy its connection string.
2. Render → New → Blueprint → select the repository. Enter the `sync: false` secrets when asked.
   Use the **same** `ENCRYPTION_KEY` as local if you will import local data.
3. Render builds with `npm ci --include=dev && npm run build`, starts `npm start`, and checks `/health`.
4. Register the HTTPS callback URLs (`https://<service>.onrender.com/api/accounts/callback/<platform>`)
   in the Meta, Google and LinkedIn developer consoles.
5. Set `EXPO_PUBLIC_API_BASE_URL=https://<service>.onrender.com` for the production app build.

To move local data to Atlas, run the migration script (or `mongodump`/`mongorestore`) with
`MONGODB_URI` pointing at Atlas.

## Migrating the old Worker's local data

```bash
npm run migrate:d1 -- --dry-run   # verify only
npm run migrate:d1                # insert missing documents; safe to re-run
```

The script copies `.wrangler/state` and a JSON export to `.migration-backups/<timestamp>/` first
(gitignored — it contains password hashes and encrypted tokens), then migrates and verifies counts,
media fields, the analytics baseline, and that credentials decrypt.

## Collections

`users`, `profiles`, `sessions`, `connected_accounts`, `platform_credentials` (encrypted),
`content_items` (all platforms), `account_insights`, `sync_runs`, `ai_cache` (TTL), `ai_questions`,
`ai_usage` (TTL), `oauth_states` (TTL), `pending_connections` (TTL), `notifications`, `files`.

## API

Unchanged paths and envelope. Full endpoint matrix: `docs/MIGRATION_REPORT.md`.
