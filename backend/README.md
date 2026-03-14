# Voice Color Agent Proxy

## Start

```bash
cd backend
cp .env.example .env
npm install
npm start
```

## SiliconFlow Configuration

`backend/.env` default values are set for SiliconFlow OpenAI-compatible API:

```bash
MODEL_BASE_URL=https://api.siliconflow.cn/v1
MODEL_PRIMARY_NAME=Qwen/Qwen2.5-32B-Instruct
MODEL_FALLBACK_NAME=Qwen/Qwen2.5-14B-Instruct
MODEL_TIMEOUT_MS=8000
MODEL_API_KEY=<your_rotated_key>
```

Notes:
- Rotate exposed keys before writing to `.env`.
- Keep `MODEL_NAME` for legacy compatibility; when `MODEL_PRIMARY_NAME` is present, it takes priority.

## Android device routing

For a physical Android device, run:

```bash
adb reverse tcp:8787 tcp:8787
```

The app calls `http://127.0.0.1:8787/v1/color/interpret`.

You can validate proxy and model route:

```bash
curl http://127.0.0.1:8787/health
curl -X GET https://api.siliconflow.cn/v1/models -H "Authorization: Bearer $MODEL_API_KEY"
```

## Endpoint

- `POST /v1/color/interpret`
- Body: `transcript`, `currentParams`, `locale`, optional `sceneHints`
- Response: `intent_actions`, `confidence`, `reasoning_summary`, `fallback_used`, `needsConfirmation`, `message`, `source`

## Community (SQLite local)

Set local SQLite env in `backend/.env`:

```bash
COMMUNITY_ENABLE=true
DB_CLIENT=sqlite
SQLITE_PATH=./data/community.sqlite
DB_SSL=false
COMMUNITY_PAGE_SIZE_DEFAULT=10
COMMUNITY_PAGE_SIZE_MAX=30
```

Default local data file path is `backend/data/community.sqlite`.

The service auto-runs SQL migrations in `backend/migrations/*.sql` on startup.

Community endpoints:

- `GET /v1/community/feed?page&size&filter`
- `GET /v1/community/me/posts?status&page&size`
- `POST /v1/community/drafts`
- `PUT /v1/community/drafts/:id`
- `POST /v1/community/drafts/:id/publish`
- `POST /v1/community/posts/:id/like`
- `POST /v1/community/posts/:id/save`
- `GET /v1/community/posts/:id/comments?page&size`
- `POST /v1/community/posts/:id/comments`

Auth policy:

- Public read: `GET /v1/community/feed`, `GET /v1/community/posts/:id/comments`
- Login required: `GET /v1/community/me/posts` and all `POST`/`PUT` community endpoints

Login-required endpoints must include header:

- `Authorization: Bearer <token>`

Use `/v1/auth/register` or `/v1/auth/login` to obtain token.

## Account + Profile (SQLite + JWT)

Set account env in `backend/.env`:

```bash
JWT_SECRET=<strong_secret>
JWT_EXPIRES_IN=7d
SQLITE_DB_PATH=./data/app.db
```

Default account data file path is `backend/data/app.db`.
Account migrations run from `backend/migrations-account/*.sql` on startup.

Auth endpoints:

- `POST /v1/auth/register` (`username`, `password`)
- `POST /v1/auth/login` (`username`, `password`)

Profile endpoints (require `Authorization: Bearer <token>`):

- `GET /v1/profile/me`
- `PATCH /v1/profile/me` (`displayName`, `avatarUrl`, `tier`)
- `PATCH /v1/profile/me/settings` (`syncOnWifi`, `communityNotify`, `voiceAutoApply`)

## Debug no-login mode

For local debugging, auth can be bypassed so all features are available without manual login:

```bash
AUTH_BYPASS=true
AUTH_BYPASS_USER_ID=1
AUTH_BYPASS_USERNAME=debug_user_1
```

When `AUTH_BYPASS` is enabled, protected endpoints automatically run under the debug user.
