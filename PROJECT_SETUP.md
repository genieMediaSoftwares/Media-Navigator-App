# Media Navigator — Project Setup

Media Navigator is a mobile app for social media intelligence and performance management.

- **Milestone 1 (done):** project foundation.
- **Milestone 2 (done):** git repository, D1 schema, and real email/password authentication.

The app contains no seed data, mock data, demo users, or fake analytics. Every record is created by a real user through the API.

## 1. Repository and git structure

One git repository sits at the project root, on the `main` branch. `Frontend/` and `Backend/` are plain folders, not separate repositories. Nothing has been committed yet.

```
media navigator/            <- git root
├── .gitignore              root rules: secrets, local state, build output
├── PROJECT_SETUP.md
├── Frontend/               Expo + React Native app (has its own tool-generated .gitignore)
└── Backend/                Cloudflare Worker API (has its own tool-generated .gitignore)
```

Git ignores the following, which was verified with `git check-ignore`:

- `.env` and `.env.*` (except `.env.example`)
- `.dev.vars` and `.dev.vars.*` (except `.dev.vars.example`)
- `.wrangler/`, which holds local D1/R2/KV state
- `node_modules/`
- `.expo/` and `expo-env.d.ts`
- `dist/`, `web-build/`, and the generated `Frontend/ios` and `Frontend/android`
- key and certificate files

The `AGENTS.md` and `CLAUDE.md` files and `Frontend/.claude/settings.json` are kept.

## 2. Installed technologies

Environment: Node.js 24.16.0, npm 11.13.0. Nothing is installed globally. Expo and Wrangler run through `npx` from each project's own dependencies.

### Frontend

| Package | Version | Purpose |
|---------|---------|---------|
| expo | 57.0.25 | SDK 57 |
| react / react-dom | 19.2.3 | `react-dom` is pinned to match `react`. Otherwise npm pulls `react-dom@19.3.0` as an optional peer and hits an ERESOLVE conflict. |
| react-native | 0.86.3 | |
| expo-router | 57.0.23 | File-based navigation and protected routes |
| expo-secure-store | 57.0.4 | Session token storage (iOS Keychain / Android Keystore) |
| @expo/vector-icons | 15.1.1 | Ionicons (password show/hide, notices, tab icon) |
| expo-font | 57.0.4 | Required peer dependency of `@expo/vector-icons` |
| expo-linking, expo-constants, expo-status-bar | 57.0.x | Expo Router peers |
| react-native-screens | 4.26.2 | Expo Router peer |
| react-native-safe-area-context | 5.7.0 | Safe areas |
| nativewind | 4.2.7 | Tailwind styling |
| react-native-reanimated / react-native-worklets | 4.5.1 / 0.10.1 | NativeWind peers; UI motion |
| expo-linear-gradient | 57.0.2 | Gradient surfaces |
| expo-image | 57.0.5 | Cached media thumbnails |
| react-native-svg | 15.15.4 | Official SVG logo rendering |
| tailwindcss (dev) | 3.4.19 | NativeWind v4 needs Tailwind 3 |
| babel-preset-expo (dev) | 57.0.13 | |
| typescript (dev) | 6.0.3 | |

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| wrangler (dev) | 4.141.0 | Dev server, deploy, D1 migrations, type generation |
| typescript (dev) | 5.9.3 | |
| vitest (dev) | 4.1.11 | Tests |
| @cloudflare/vitest-plugin (dev) | 1.2.8 | Runs tests inside workerd, with local D1 |
| @types/node (dev) | 26.6.3 | |

The Worker has **no runtime dependencies**. Password hashing, session tokens and routing all use Web Crypto and plain TypeScript.

## 3. Folder structure

```
Frontend/
├── app.json                  scheme, typed routes, plugins (expo-router, expo-secure-store, expo-font)
├── babel.config.js / metro.config.js / tailwind.config.js / nativewind-env.d.ts
├── .env.example              EXPO_PUBLIC_API_BASE_URL
└── src/
    ├── app/                  Expo Router routes only
    │   ├── _layout.tsx       AuthProvider + Stack with Stack.Protected guards
    │   ├── index.tsx         Entry: redirects to /(tabs) or /auth/login
    │   ├── auth/
    │   │   ├── _layout.tsx
    │   │   ├── login.tsx
    │   │   ├── signup.tsx
    │   │   └── forgot-password.tsx
    │   ├── (tabs)/
    │   │   ├── _layout.tsx   Bottom tabs: Home, Intelligence, Planner, Profile
    │   │   ├── index.tsx     Home: Social Overview (GET /api/overview)
    │   │   ├── intelligence.tsx  Intelligence home (GET /api/intelligence/overview), see §15
    │   │   ├── planner.tsx   Timing heatmap, day selector, windows (GET /api/planner/insights)
    │   │   └── profile.tsx   Real name/email from /me, settings rows, Sign out
    │   ├── connected-accounts.tsx  Platform connection list (GET /api/accounts, POST /api/accounts/connect)
    │   └── notifications.tsx       GET /api/notifications
    ├── components/           Shared UI (see §13): BrandLogo, BrandHeader, Screen, TabScreen, SectionHeader,
    │   │                     EmptyState, LoadingState, ErrorState, AsyncContent, StatCard, PlatformCard,
    │   │                     BottomSheet, ListRow, FullScreenStatus (SplashView)
    │   └── ui/               Button, TextField, TextLink, Notice, Card, IconButton, Divider, Skeleton
    ├── constants/            colors.ts, theme.ts, variants.ts (design tokens, §13)
    ├── config/env.ts         Reads EXPO_PUBLIC_API_BASE_URL
    ├── features/
    │   ├── auth/             api.ts, auth-context.tsx, validation.ts
    │   ├── accounts/         api.ts, platforms.ts (UI catalog), useConnectAccount.ts
    │   ├── home/             api.ts, components/ (HeroSignalBanner, ChannelCard, HomeContent, HomeSkeleton)
    │   ├── intelligence/     api.ts, labels.ts, session.ts, components/ (sections, MediaRow, Evidence, PostAnalysisSection…)
    │   ├── planner/          api.ts, components/ (DaySelector, TimingHeatmap, WindowCard, PlannerContent)
    │   └── notifications/    api.ts
    ├── hooks/useApiResource.ts  loading / unavailable / error / success + pull-to-refresh
    ├── lib/api/client.ts     fetch wrapper: JSON envelope, bearer auth, 401 handling
    ├── lib/format.ts         Number, percent, date and hour formatting for API values
    ├── lib/storage/secure-storage.ts
    ├── types/api.ts          Data contracts for every API response (types only)
    └── global.css

Backend/
├── wrangler.jsonc            Bindings, vars, required secrets
├── worker-configuration.d.ts Generated Env types (npm run cf-typegen)
├── .dev.vars.example
├── migrations/
│   └── 0001_auth_schema.sql
├── src/
│   ├── index.ts              Route table, dispatch, CORS, error handling
│   ├── lib/                  http (envelope, JSON body), router types, crypto, password, validation, cors
│   ├── middleware/auth.ts    authenticate() + withAuth()
│   ├── db/                   users.ts, sessions.ts (parameterized D1 queries)
│   ├── routes/               health.ts, auth.ts, features.ts (planned-feature contracts, 501)
│   └── services/             (empty; future Gemini and platform clients)
└── test/                     auth.spec.ts, features.spec.ts, index.spec.ts, helpers.ts, apply-migrations.ts, env.d.ts
```

## 4. Database schema (D1)

The schema lives in `Backend/migrations/0001_auth_schema.sql`. It creates tables and indexes only and **inserts no rows**.

Conventions:
- **IDs:** UUIDv4 from `crypto.randomUUID()`, which uses a CSPRNG.
- **Timestamps:** `INTEGER` milliseconds since the Unix epoch, in UTC.
- **Foreign keys:** enforced by D1. Deleting a user cascades to their profile and sessions.

### users

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| email | TEXT NOT NULL | Unique (`users_email_unique`). Stored trimmed and lower-cased; a CHECK constraint enforces this. |
| password_hash | TEXT NOT NULL | `pbkdf2-sha256$<iterations>$<salt>$<hash>`. A CHECK constraint enforces the prefix. |
| created_at, updated_at | INTEGER NOT NULL | |

### profiles

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| user_id | TEXT NOT NULL | FK to users.id, `ON DELETE CASCADE`. Unique, so one profile per user. |
| display_name | TEXT NOT NULL | 1–80 characters (CHECK) |
| avatar_key | TEXT NULL | Future R2 object key in `MEDIA_BUCKET`. Always NULL for now; no avatar is ever created automatically. |
| created_at, updated_at | INTEGER NOT NULL | |

### sessions

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| user_id | TEXT NOT NULL | FK to users.id, `ON DELETE CASCADE`. Indexed. |
| token_hash | TEXT NOT NULL | SHA-256 hex digest of the token; the token itself is never stored. Unique. 64 characters (CHECK). |
| expires_at | INTEGER NOT NULL | Indexed, so expired sessions can be purged later. Must be greater than created_at (CHECK). |
| created_at | INTEGER NOT NULL | |
| last_used_at | INTEGER NOT NULL | Updated at most once a minute per session |
| revoked_at | INTEGER NULL | NULL means the session is active |

### Migration commands (run from `Backend/`)

```bash
npm run db:migrate:local                         # apply to the local D1 used by `npm run dev`
npm run db:migrate:remote                        # apply to the Cloudflare D1 database (not run yet)
npx wrangler d1 migrations list media-navigator-db --local
npx wrangler d1 migrations create media-navigator-db <name>   # new migration file
```

Tests apply the same migration files automatically to an isolated test database (`test/apply-migrations.ts`).

## 5. Environment variables

### Frontend: `Frontend/.env` (copy from `.env.example`)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | Yes | Worker base URL, with no trailing slash. It is compiled into the app bundle, so it must never contain a secret. |

The app never receives `GEMINI_API_KEY` or any other secret.

### Backend: `Backend/.dev.vars` locally (copy from `.dev.vars.example`), Wrangler secrets in production

| Name | Kind | Required | Description |
|------|------|----------|-------------|
| `GEMINI_API_KEY` | Secret (`secrets.required`) | Yes (not used yet) | Production: `npx wrangler secret put GEMINI_API_KEY`. Dev and tests print a "missing required secret" warning until it's set. |
| `CORS_ALLOWED_ORIGINS` | Var (`wrangler.jsonc`) | No | Comma-separated browser origins, e.g. `http://localhost:8081` for Expo web. Empty means no cross-origin browser access. Native apps are unaffected. You can override it in `.dev.vars`. |

## 6. Cloudflare bindings

| Binding | Type | Resource | Used by milestone 2 |
|---------|------|----------|---------------------|
| `DB` | D1 | `media-navigator-db` | Yes: users, profiles, sessions |
| `MEDIA_BUCKET` | R2 | `media-navigator-media` | No (reserved for avatars and media) |
| `CACHE` | KV | auto-named | No |

No Cloudflare resources have been created and nothing has been deployed. The D1 and KV bindings have no IDs, so `wrangler deploy` would provision them automatically. The alternative is to create them first with `npx wrangler d1 create media-navigator-db`, `npx wrangler kv namespace create CACHE` and `npx wrangler r2 bucket create media-navigator-media`, then add the IDs to `wrangler.jsonc`. Run `npm run db:migrate:remote` before the first real deploy.

## 7. API

Every response uses the same JSON envelope:

```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password." } }
```

Validation errors also include `error.fields`, e.g. `{ "email": "Enter a valid email address." }`. Responses never include stack traces, password hashes, token hashes or internal details. All responses send `Cache-Control: no-store`.

| Method | Path | Auth | Success | Errors |
|--------|------|------|---------|--------|
| GET | `/health` | – | 200 `{status:"ok"}` | |
| POST | `/api/auth/signup` | – | 201 `{user, session}` | 400 `VALIDATION_ERROR`, 409 `EMAIL_ALREADY_REGISTERED`, 415, 413 |
| POST | `/api/auth/login` | – | 200 `{user, session}` | 400 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS` |
| POST | `/api/auth/logout` | Bearer | 200 `null` | 401 |
| GET | `/api/auth/me` | Bearer | 200 `{user}` | 401 `AUTH_REQUIRED` / `INVALID_SESSION` / `SESSION_EXPIRED` |
| POST | `/api/auth/forgot-password` | – | – | 501 `PASSWORD_RESET_NOT_CONFIGURED` (see §9) |
| GET | `/api/overview` | Bearer | future `HomeOverview` | 401, **501 `FEATURE_NOT_AVAILABLE`** |
| GET | `/api/accounts` | Bearer | future `{accounts}` | 401, **501** |
| POST | `/api/accounts/connect` | Bearer | future `{authorizationUrl}` | 400 (unknown platform), 401, **501** |
| GET | `/api/intelligence/*` | Bearer | See §15 | 401, 404, 422, 503 |
| GET | `/api/planner/insights` | Bearer | future `PlannerInsights` | 401, **501** |
| GET | `/api/notifications` | Bearer | future `{notifications}` | 401, **501** |

The planned-feature routes (`Backend/src/routes/features.ts`) require a valid session and currently always return 501 with a user-facing message. They fix each feature's URL and auth requirement now. The app shows a "not available yet" state for them, driven by the server. Each handler will be replaced with the real implementation; the response shapes are defined in `Frontend/src/types/api.ts`.

Other responses:
- Unknown path: 404 `NOT_FOUND`.
- Known path with the wrong method: 405 `METHOD_NOT_ALLOWED`, with an `Allow` header.
- Unexpected server error: 500 `INTERNAL_ERROR`.

Request body: `signup` takes `{ email, password, displayName }`; `login` takes `{ email, password }`.

Response `user`: `{ id, email, profile: { displayName, avatarKey } }`. Response `session`: `{ token, expiresAt }`, where `expiresAt` is an ISO 8601 string. The token is only returned by signup and login.

## 8. Authentication flow

**Signup**
1. The app validates the input locally.
2. The app sends `POST /api/auth/signup`.
3. The Worker validates the input again, normalizes the email (trim, lowercase), and rejects existing emails.
4. It hashes the password and generates a 32-byte random token.
5. One D1 batch (a transaction) inserts the user, profile and session (`token_hash` only).
6. The Worker returns the user and the token.
7. The app saves the token to SecureStore, and the guard switches to `/(tabs)`.

**Login**
1. The Worker normalizes the email, looks up the user and verifies the password in constant time.
2. If the email is unknown, it still runs one full hash verification so response times stay the same.
3. It always issues a **new** session and returns the user and token.
4. The app stores the token.

**Authenticated requests**

`apiRequest(path, { auth: true })` reads the token from SecureStore and sends `Authorization: Bearer <token>`. `withAuth` in `middleware/auth.ts` then:
1. Extracts the token and checks its format.
2. Computes its SHA-256 digest.
3. Looks up the session joined to its user.
4. Rejects the request with 401 if the session is missing, revoked or expired.
5. Passes `{ user, session }` to the handler.

**Invalid or expired session**

When any authenticated request returns 401, the app:
1. Deletes the stored token.
2. Tells the `AuthProvider`, which switches to `unauthenticated`.
3. Lets the `Stack.Protected` guard send the user to the login screen.

No cached or placeholder data is shown.

**Logout**
1. The app sends `POST /api/auth/logout`, and the Worker sets `revoked_at` on the current session only.
2. The app always deletes the local token.
3. If the server couldn't be reached, the app says so. The session then stays valid on the server until it expires.

**App start**
1. If no token is stored, the app shows the auth screens.
2. If a token exists, the app calls `GET /api/auth/me`.
   - Success: the app shows the protected area.
   - 401: the app clears the token and shows the auth screens.
   - Network or other error: the app shows an "Unable to verify your session" screen with **Try again** and **Sign out**. It never assumes the user is signed in.

**Navigation map**

```
Splash (SplashView, shown while the stored session is checked)
  ├─ no valid session → Login ↔ Signup, Login → Forgot Password
  └─ valid session    → Tabs: Home · Intelligence · Planner · Profile
```

The splash is a JS view rendered by the root layout, not a route and not the native splash screen. Intelligence and Planner show honest empty states until those features are built. Sign out lives on the Profile tab.

**Routing**
- Route guards on the device only control which screens can be reached.
- The **Worker is the source of truth**: every protected endpoint re-authenticates each request.

## 9. Security decisions

**Password hashing**
- PBKDF2-HMAC-SHA256 through the Workers runtime's native Web Crypto (no dependency).
- 100,000 iterations, 16-byte random salt, 32-byte derived key, compared in constant time with `crypto.subtle.timingSafeEqual`.
- 100,000 is the highest PBKDF2 iteration count the Cloudflare Workers runtime is generally reported to accept. Local workerd didn't enforce a cap when tested, so this limit hasn't been confirmed on Cloudflare yet.
- Argon2id or scrypt would need WebAssembly or pure-JS implementations, which are expensive under Workers CPU limits.
- The hash string records the algorithm and iteration count, so a stronger scheme can be adopted later by re-hashing each user at their next login.
- **Cost:** about 60 ms of CPU per hash, measured locally. That's more than the Workers Free plan's 10 ms CPU limit, so signup and login need the **Workers Paid** plan (default limit 30 s).

**Password policy**
- 8–128 characters, and not only whitespace.
- No composition rules, following NIST SP 800-63B.

**Session tokens**
- 32 bytes from `crypto.getRandomValues`, base64url-encoded.
- Only the SHA-256 digest is stored. Plain SHA-256 is enough here because the token has 256 bits of entropy.
- **Session length:** sessions expire 30 days after creation, fixed rather than sliding.

**Session fixation**
- Every login and signup creates a new server-generated token.
- The client can never choose its own token.
- Logout revokes only the current session.

**SQL injection**
- Every query uses D1 prepared statements with bound parameters.

**Account enumeration**
- Login returns the same `INVALID_CREDENTIALS` error and takes the same time whether or not the email exists.
- Signup does reveal that an email is registered (409). That's a deliberate usability trade-off; revisit it once email verification exists.

**Logging**
- Only method, path, error name/message and stack are logged for unexpected errors.
- Request bodies, headers, passwords and tokens are never logged. A live `wrangler dev` session was checked: no password or token appeared in the log.

**Input handling**
- JSON only (415 otherwise), 16 KB maximum body size (413), and objects only (400).

**CORS**
- An allowlist from `CORS_ALLOWED_ORIGINS`, empty by default.
- No `Allow-Credentials`, because auth uses a bearer header rather than cookies, which also rules out CSRF.

**Client storage**
- The token is kept only in SecureStore; AsyncStorage is never used.
- The password is never stored.

**Forgot password**
- No email provider is configured, so the endpoint returns 501 `PASSWORD_RESET_NOT_CONFIGURED`.
- The screen says the feature isn't available yet and shows the server's real response. It never claims an email was sent.

### Required before production

1. **Rate limiting.** Apply per-IP and per-email limits to `/api/auth/login`, `/signup` and `/forgot-password`. Candidates are the Workers Rate Limiting binding or Cloudflare WAF rate-limiting rules. Not implemented yet.
2. **Email verification and password reset.** Choose an email provider, add a `password_reset_tokens` table (hashed, single-use, short expiry), and revoke all sessions on password change.
3. **Workers Paid plan.** Needed for the PBKDF2 CPU cost, or password hashing has to change.
4. **Session cleanup.** A Cron Trigger to delete expired or revoked sessions (`sessions_expires_at_idx` already exists).
5. **Real deploy checks.** Confirm the PBKDF2 limit on Cloudflare and apply the migrations remotely.
6. **Production CORS origins.** Set these only if a web client ships.
7. **Optional.** A "sign out of all devices" endpoint, and session listing.

## 10. Running locally

### Backend

```bash
cd Backend
npm install
cp .dev.vars.example .dev.vars        # add GEMINI_API_KEY (optional for auth work)
npm run db:migrate:local              # create tables in the local D1 (empty)
npm run dev                           # http://localhost:8787
# for a physical device on the same network:
npx wrangler dev --ip 0.0.0.0
```

### Frontend

```bash
cd Frontend
npm install
cp .env.example .env                  # EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:8787
                                      # Android emulator: http://10.0.2.2:8787, iOS simulator: http://localhost:8787
npx expo start
```

Create an account from the app's signup screen. No accounts exist until you do.

## 11. Testing

```bash
# Backend
cd Backend
npm run typecheck       # tsc for src/ and test/
npm test                # vitest run inside workerd, with the real migrations applied

# Frontend
cd Frontend
npm run typecheck
npx expo-doctor
npx expo export --platform android --output-dir <tmp-dir>
```

Backend tests (`test/auth.spec.ts`, `test/index.spec.ts`, 21 tests) cover:
- Signup: success, email normalization, a password hash in the database (never plaintext), and only the token digest stored.
- Signup rejections: duplicate email (including different case), invalid email, weak password, missing name, non-JSON body.
- Login: success with a new token, wrong password, unknown email (same error).
- `/me`: valid session, missing, unknown or malformed token, revoked session, expired session.
- Logout: revokes the session. The revoked token is then refused by `/me` and by `/logout`. Other sessions of the same user keep working.
- Forgot password: 501. Health, 404, 405 and the CORS allowlist.

Test users are created only in the test runtime's isolated D1, with unique random emails.

### Results at the end of milestone 2

| Check | Result |
|-------|--------|
| Backend `npm run typecheck` | Pass |
| Backend `npm test` | 21/21 pass |
| Backend `db:migrate:local` | `0001_auth_schema.sql` applied; all 3 tables and 5 indexes present; 0 rows |
| Backend live `wrangler dev` + curl | health 200 · signup 201 · duplicate 409 · wrong password 401 · login 200 · `/me` without token 401 · `/me` with token 200 · logout 200 · `/me` after logout 401 · forgot-password 501. The temporary smoke-test account was deleted afterwards; the local DB is back to 0 users, profiles and sessions. |
| Backend `wrangler deploy --dry-run` | Bundles (17.12 KiB); all bindings resolve |
| Frontend `tsc --noEmit` (with generated typed routes) | Pass |
| Frontend `expo-doctor` | 21/21 |
| Frontend `expo export --platform android` | Bundles (1614 modules) |
| Expo Router route tree | Built with `getRoutes` in development mode: `index`, `(tabs)/index` and `auth/*` produce no conflicts |

### Results at the end of step 3 (mobile UI and design system)

| Check | Result |
|-------|--------|
| Backend `npm run typecheck` | Pass |
| Backend `npm test` | 32/32 pass (adds 11 planned-feature tests: 401 without a session, 501 with one, 400 for an unknown platform) |
| Backend live `wrangler dev` + curl | signup, login, `/me` 200 · every planned endpoint 401 without a token and 501 with one · connect returns "Connecting YouTube isn’t available yet." · logout 200 · `/api/overview` and `/me` 401 after logout. The smoke-test account was deleted; local DB back to 0 rows. |
| Frontend `tsc --noEmit` (with regenerated typed routes) | Pass |
| Frontend `expo-doctor` | 21/21 |
| Frontend `expo export --platform android` | Bundles (1659 modules) |
| Tailwind compile with the token-driven config | Every token class used in components is generated, e.g. `text-display` (28/34/700), `rounded-lg` (12px), `bg-primary/45`, `min-h-14` |
| Route tree | `(tabs)/{index,intelligence,planner,profile}`, `connected-accounts`, `notifications`, `auth/*`; no conflicts |
| Fake-data scan of `Frontend/src`, `Backend/src` and `Backend/migrations` | No mock/demo/sample/seed data, metric literals, fake handles, or object literals of domain types. The only INSERTs are the parameterized signup statements. Gemini appears only in comments; no AsyncStorage. |

**Not yet verified:**
- The app hasn't been run on a device, emulator or Expo Go, so the screens, SecureStore and the redirect behaviour were only verified by typecheck and bundling, not interactively.
- The iOS and web bundles haven't been tested.
- Nothing has been deployed to Cloudflare, and the D1 migration hasn't been applied remotely.

## 12. Status

**Completed**
- Milestone 1: project foundation.
- Milestone 2:
  - One root git repository with secrets ignored.
  - D1 schema migration (users, profiles, sessions).
  - PBKDF2 password hashing and hashed, revocable, expiring sessions.
  - Signup, login, logout and `/me` endpoints.
  - Reusable auth middleware, a consistent JSON envelope, and CORS allowlisting.
  - SecureStore token handling, an API client with bearer auth and 401 handling, and an `AuthProvider`.
  - Expo Router protected routing.
  - Login, signup and forgot-password screens, and the authenticated home empty state.
  - Backend tests.
- Navigation map: branded splash, auth stack, and four authenticated tabs.
- Step 3, mobile UI and design system (§13):
  - Token-driven design system: one color source, spacing, radius, type scale, elevation, variants.
  - 22 shared components.
  - All screens built with loading, empty, error, not-available and success states.
  - Typed data contracts for every future response.
  - Planned-feature API contracts (501).
  - Connected accounts and notifications screens.

**Remaining** (in order)
1. Run the app on an Android emulator and an iOS simulator or device against local `wrangler dev`. Check each screen state, pull-to-refresh, the bottom sheet, the keyboard on the auth forms, small screens and large system font sizes.
2. Pre-production security items (§9): rate limiting first, then the email provider for verification and password reset.
3. Create the Cloudflare resources, apply migrations remotely, set secrets, and do the first deploy.
4. Add the official Media Navigator logo (SVG) in `BrandLogo`. This needs `react-native-svg` or a PNG export.
5. First real integration, e.g. Instagram OAuth:
   - A `connected_accounts` table.
   - `POST /api/accounts/connect` returning `authorizationUrl`, and an OAuth callback that stores encrypted tokens.
   - `GET /api/accounts` from D1.
   - Then ingestion into posts and metrics tables, `/api/overview`, the Worker-side Gemini diagnosis, planner timing analysis, and notifications.
6. Profile editing, including avatar upload to R2 via `avatar_key`. Security, Preferences, Help, Privacy Policy and Terms content.
7. Linting, and CI running typecheck and tests for both projects. EAS build profiles.

## 13. Design system and mobile UI

### Tokens: one source of truth
- **`src/constants/colors.ts`:**
  - `palette`: brand navy, primary blue and light blue ("sky"); a neutral gray scale; success, warning, danger and info with light and border tints.
  - `colors`: the same values as plain strings for props that can't take a `className`.
- **`src/constants/theme.ts`:**
  - `spacing`: xs 4, sm 8, md 12, lg 16, xl 24, 2xl 32, 3xl 48.
  - `radius`: sm 6, md 8, lg 12, xl 16.
  - `typography`: display 28/34, heading 22/28, title 17/24, body 16/24, label 14/20, caption 13/18.
  - `touchTarget`: 44.
  - `elevation.sheet`: the only shadow, used for the bottom sheet.
- **`src/constants/variants.ts`:** button (primary, secondary, ghost, danger; sizes md and sm), input (default, focused, error, disabled), card (outlined, filled, brand) and notice (error, warning, success, info).
- **`tailwind.config.js`:** loads `colors.ts` and `theme.ts` directly (Tailwind's config loader supports TypeScript). Every token is therefore also a class, e.g. `bg-primary`, `text-neutral-500`, `p-lg`, `rounded-lg`, `text-heading`. Components never hardcode hex values.

### Visual language (redesign)
- **Color roles:** midnight navy (structure), electric blue (primary actions and data), violet (AI), magenta, cyan and amber (format accents and timing). One accent color per content format (`FORMAT_LABELS` in `features/intelligence/labels.ts`).
- **Gradients** (`gradients` in `colors.ts`, rendered by `components/visual/Gradient.tsx` via `expo-linear-gradient`):
  - `brand`: at most one hero surface per screen.
  - `ai` and `aiSoft`: AI output only.
  - `scrim`: text over media.
  - `attention`: the Needs attention band.
- **Type scale:** adds `hero` (44/48, weight 800) for headline numbers and `overline` (11/14, weight 700) for section eyebrows.
- **Structure:** hairlines, whitespace and full-bleed bands instead of bordered cards.
- **Shared visual components** (`components/visual/`):
  - `Gradient`, `Overline`, `SectionTitle`, `SegmentedControl`.
  - `MetricStrip`: typographic stats line.
  - `MetricPill`, `AnimatedBar`, `PerformanceBar`.
  - `SparkBars`: real per-post values only.
  - `PressableScale`, `FadeIn`.
- **Intelligence components** (`features/intelligence/components/`):
  - `MediaTile` / `MediaRail`: media with scrim-overlay metrics.
  - `InsightHero`, `PerformanceHero`, `NeedsAttention`.
  - `FormatMix` / `FormatComparison`, `WeekPattern`.
- **Logo:** rendered only by `components/brand/MediaNavigatorLogo.tsx`. It uses the official logo `assets/brand/media-navigator-logo.png` (1088×350, transparent). That file is the supplied JPEG cropped without scaling, with the white canvas removed by exact colour-to-alpha, so it is pixel-identical on white. A true vector version, if ever supplied, can be pasted into `LOGO_SVG` in `components/brand/logoSource.ts` and takes priority. No official dark-background variant exists.
- **Images:** `expo-image` with memory and disk caching and list recycling.
- **Animation:** Reanimated components are registered with NativeWind in `lib/nativewind-interop.ts`, so `className` works on them. Entrance animations follow the system Reduce Motion setting.

### Components
- **`components/ui`:** Button, TextField, TextLink, Notice, Card, IconButton, Divider, Skeleton.
- **`components`:** BrandLogo, BrandHeader, Screen, TabScreen, SectionHeader, EmptyState, LoadingState, ErrorState, AsyncContent, StatCard, PlatformCard, BottomSheet, ListRow, FullScreenStatus.
- **Feature components:** see §3.
- **BottomSheet:** built on RN `Modal` plus a `react-native-reanimated` slide-in (Reanimated was already installed). No new dependencies.

### How screens handle data
`useApiResource` + `AsyncContent` render exactly one state:

| State | When | What the user sees |
|-------|------|--------------------|
| loading | Request in flight | Skeleton (Home, Intelligence) or spinner with a label |
| unavailable | Worker answers 501 | EmptyState using the server's message |
| error | Network or other failure | ErrorState with the real message and Retry |
| empty | Success with no data | Specific empty copy, e.g. "No accounts connected yet." |
| success | Success with data | Only values from the response |

- **Pull-to-refresh** re-requests the API. A failed refresh shows the error; it never keeps showing stale or invented data.
- **Connect** calls the Worker. When OAuth exists, the Worker's `authorizationUrl` opens in the browser. Until then, the Worker's 501 message is shown. Nothing is ever marked connected on the device.
- **`PlatformCard`** shows a status only when the API supplied one. If the connection state is unknown, it shows no status at all.

### Screens
- **Splash:** text wordmark.
- **Login, Signup, Forgot password.** Forgot password shows the server's "not configured" answer as a warning and never says an email was sent.
- **Home:** hero signal, channel carousel, three quick-glance StatCards, and a notifications button.
- **Intelligence:** swipeable top and bottom performer carousels. Tapping a post opens the AI Diagnosis sheet: summary, five dimension scores shown as bars with numbers, and recommendations. If there's no diagnosis, the sheet says "No AI diagnosis available yet."
- **Planner:** heatmap built only from the cells the API returns, a day selector, recommended windows, and a disabled "Schedule a post" button with "Scheduling isn’t available yet."
- **Profile:** header from `/me`, Account and Support groups, and a Sign out confirmation.
- **Connected accounts** and **Notifications:** pushed screens with native headers.

### Accessibility and responsiveness
- **Touch targets:** at least 44dp, including text links and icon buttons.
- **Labels:** icon-only buttons are labelled. Tabs use a filled icon when active and an outline icon when inactive.
- **Not color alone:** change values show an arrow and text, heatmap cells expose their exact score, and dimension bars show "NN/100".
- **Motion:** the skeleton pulse stops when Reduce Motion is on.
- **Layout:** safe areas are handled by SafeAreaView, the tab bar and the sheet. The auth forms are keyboard-aware. Nothing uses absolute positioning for layout. Long names and emails wrap. Carousel card widths come from `useWindowDimensions`.

## 14. Instagram / Meta Access Token Connection (Option A)

### Overview

Media Navigator integrates directly with Meta's official Instagram Graph API via Option A (User-supplied Meta Graph API User Access Token). The integration enforces strict zero-fake-data policies: only verified Meta API responses create connected account records.

### Connection Flow (Option A)

```
Mobile App
  │ 1. User taps "Connect" on Instagram in Connected Accounts screen
  ▼
Display Token Form
  │ 2. Heading: "Get your Meta Graph API access token"
  │ 3. CTA "Get token from Meta" ──▶ opens external browser: https://developers.facebook.com/tools/explorer/
  │ 4. User generates & copies real Meta User Access Token
  │ 5. User returns to app & pastes token into password-style TextField
  │ 6. User taps "Connect Account"
  ▼
POST /api/accounts/connect { platform: "instagram", accessToken: "..." }
  │
Worker API
  ├─▶ 7. Authenticates session (withAuth)
  ├─▶ 8. Calls Meta Graph API (/me/accounts?fields=instagram_business_account) with token
  ├─▶ 9. Verifies Meta response & extracts real platformAccountId, username, displayName
  ├─▶ 10. Encrypts token server-side (AES-256-GCM) & stores in Cloudflare KV (credentials:userId:ref)
  ├─▶ 11. Checks duplicate accounts across users (409 if owned by another user)
  ├─▶ 12. Upserts account record in D1 connected_accounts (storing token_reference only)
  └─▶ 13. Returns safe account payload: { success: true, account: { id, platform, username, displayName, status } }
  │
Mobile App
  └─▶ 14. Refreshes connected accounts list & renders real connected account card
```

### Server-Side Credential Storage & Encryption Architecture

- **Zero plaintext tokens in D1 / logs / API responses:** Access tokens and secrets are never stored in D1, never returned over API endpoints, never passed through URL parameters, never logged, and never saved in client storage.
- **AES-256-GCM Web Crypto Encryption:** Credentials are encrypted server-side using Web Crypto `crypto.subtle` (AES-GCM with a 96-bit random IV per encryption) and the Worker secret `ENCRYPTION_KEY`.
- **Cloudflare KV Storage:** Encrypted payloads are stored in Cloudflare KV (`CACHE` namespace) under namespaced keys: `credentials:${userId}:${token_reference}`.
- **D1 Schema Reference:** D1 `connected_accounts` table stores only a non-sensitive `token_reference` UUID string (`cred_<uuid>`).
- **Revocation & Disconnect:** `DELETE /api/accounts/:id` verifies account ownership, deletes the encrypted credential payload from KV, and removes the account row from D1.

### D1 Schema (`0002_connected_accounts.sql`)

| Column | Type | Constraints / Notes |
|--------|------|---------------------|
| `id` | TEXT PK | UUIDv4 string |
| `user_id` | TEXT NOT NULL | Foreign key to `users(id) ON DELETE CASCADE` |
| `platform` | TEXT NOT NULL | `'instagram'`, `'youtube'`, `'linkedin'`, `'facebook'` |
| `platform_account_id` | TEXT NOT NULL | Real Instagram Business Account ID from Meta |
| `account_name` | TEXT NULL | Display name returned by Meta API |
| `account_username` | TEXT NOT NULL | Instagram handle returned by Meta API |
| `status` | TEXT NOT NULL | `'connected'`, `'reauthorization_required'`, `'error'` |
| `token_reference` | TEXT NOT NULL | Unique non-sensitive reference key to KV credential |
| `token_expires_at` | INTEGER NULL | Token expiration epoch milliseconds |
| `created_at`, `updated_at` | INTEGER NOT NULL | Epoch milliseconds |
| `last_synced_at` | INTEGER NULL | Epoch milliseconds of last sync |

Unique indexes enforce `(user_id, platform, platform_account_id)` and `(token_reference)`.

### Environment Variables & Secrets

Add the following to `.dev.vars` (Local Dev) or via `wrangler secret put` (Production):

| Secret / Var | Required | Purpose |
|--------------|----------|---------|
| `ENCRYPTION_KEY` | Secret | 32-byte server-side secret key for AES-256-GCM credential encryption |
| `META_API_VERSION` | Var | Meta Graph API version (default: `v21.0`) |

### Step-by-Step Setup Guide

1. **Obtain Meta Graph API Access Token:**
   - Open [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/).
   - Select your Meta App and User or Page token.
   - Add permissions: `instagram_basic`, `pages_show_list`.
   - Click **Generate Access Token** and copy the access token string.
2. **Configure Local Worker Secrets (`Backend/.dev.vars`):**
   ```ini
   ENCRYPTION_KEY=a_secure_32_byte_random_string_here
   ```
3. **Apply D1 Migration:**
   ```bash
   cd Backend
   npm run db:migrate:local
   ```
4. **Run Tests:**
   ```bash
   cd Backend
   npm test
   ```
5. **Start Servers:**
   ```bash
   # Terminal 1 (Backend)
   cd Backend
   npx wrangler dev --ip 0.0.0.0

   # Terminal 2 (Frontend)
   cd Frontend
   npx expo start -c
   ```
6. **Connect Account in App:**
   - In Media Navigator, navigate to **Profile -> Connected Accounts**.
   - Tap **Connect** on Instagram.
   - Tap **Get token from Meta** to open Meta Graph API Explorer if needed.
   - Paste the token into the secure token input field and tap **Connect Account**.
   - The backend validates the token with Meta, retrieves your real Instagram handle/name, encrypts the credential in KV, and displays your connected account card.

## 15. Intelligence (real-data analytics + Gemini)

### Data flow
Meta Graph API → Worker sync → D1 (`instagram_media`, `instagram_insights`) → `services/intelligence.ts` (deterministic calculations) → `/api/intelligence/*` → app. Gemini (`services/gemini.ts`, `services/aiIntelligence.ts`) is called only by the Worker.

### Migration `0004_instagram_media_insights.sql`
Adds nullable `views`, `reach`, `saved`, `shares`, `total_interactions`, `insights_synced_at` to `instagram_media`, plus a `(connected_account_id, timestamp)` index. Sync requests these per media item through field expansion (`insights.metric(...)`) on the existing media request, stepping down through smaller metric sets and finally none if Meta rejects a metric. A missing metric stays `NULL` ("Not available"), never 0. Sync now stores up to 200 recent media items (8 pages × 25) with one D1 batch per page. Run `npm run db:migrate:remote` before deploying.

### Endpoints
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/intelligence/overview?accountId=&tz=` | Account, performance summary, baseline, archive summary, What's working / Needs attention, format performance, timing sufficiency, metric definitions. `overview: null` when no Instagram account. |
| GET | `/api/intelligence/insights?accountId=&tz=` | AI executive insights. Cached in KV per account per sync. 422 `INSUFFICIENT_DATA`, 503 `AI_UNAVAILABLE`. |
| GET | `/api/intelligence/media?accountId=&q=&format=&sort=&period=&performance=&offset=&limit=` | Content library, filtered and paginated in SQL. |
| GET | `/api/intelligence/media/:id?accountId=&tz=` | Post detail: metrics, measured comparisons, observed factors. |
| GET | `/api/intelligence/media/:id/analysis` | AI post analysis (why it worked / diagnosis), cached per sync. |
| GET / POST | `/api/intelligence/ask` | Recent questions / ask a question (3–500 chars). |
| GET | `/api/planner/insights?tz=` | Now real: measured day×3-hour heatmap and windows, empty until 30 posts with engagement data. |

### Calculation rules (also returned as `definitions`)
- Interactions = likes + comments (null when Meta returned neither).
- Engagement rate = interactions ÷ current followers × 100 (current follower count, not historical).
- Baseline = mean interactions per post across synced posts; rankings need ≥ 6 posts.
- Needs attention excludes posts younger than 3 days.
- Format averages only use posts where the metric exists; `viewsSampleSize` says how many.

### AI trust model
Gemini receives only `buildAiContext()` output: account aggregates, per-post metrics and captions (truncated), format stats and timing. It never receives tokens, credential references, user IDs, emails or URLs. Gemini returns structured JSON (`observation`, `explanation`, `recommendation`, `expectedMeasurement`, evidence post IDs/formats). The Worker drops unknown evidence IDs and rebuilds **Supporting data** from stored numbers, so the model cannot place figures in that section. The app labels every block: *Observed data*, *AI summary of your data*, *AI hypothesis · not verified*, *AI suggestion*. Limit: 40 uncached AI requests per user per hour. Model: `GEMINI_MODEL` var (default `gemini-2.5-flash`).

