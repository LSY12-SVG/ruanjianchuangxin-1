# VisionGenie Modules Gateway

Strict backend gateway for five modules:
- Color intelligence (`initial-suggest`, `voice-refine`, `pro auto-grade`, `segment`)
- Pro editor grading parameters
- 2D -> 3D modeling + capture workflow (Tripo only)
- AI Agent planning/execution/memory
- Community feed/draft/publish/comment

## Start

```bash
cd backend
cp .env.example .env
npm install
npm run precheck:strict
npm start
```

If `precheck:strict` fails, startup will also fail.

## Strict Requirements

- Real model output is mandatory for color endpoints.
  - Fallback payloads are rejected with `4xx/5xx` (`REAL_MODEL_REQUIRED`, `MODEL_UNAVAILABLE`, `PROVIDER_TIMEOUT`, etc.)
- `IMAGE_TO_3D_PROVIDER` must be `tripo`.
  - Missing Tripo key/network/auth check fails startup.
- Legacy APIs are removed from the runtime gateway.

## Gateway Endpoints

- `GET /v1/modules/health`
- `GET /v1/modules/capabilities`

## Color Module

- `POST /v1/modules/color/initial-suggest`
- `POST /v1/modules/color/voice-refine`
- `POST /v1/modules/color/pro/auto-grade`
- `POST /v1/modules/color/pro/segment`
- `GET /v1/modules/color/health`

## Modeling Module (Tripo)

- `POST /v1/modules/modeling/jobs`
- `GET /v1/modules/modeling/jobs/:taskId`
- `GET /v1/modules/modeling/jobs/:taskId/assets/:assetIndex`
- `POST /v1/modules/modeling/capture-sessions`
- `GET /v1/modules/modeling/capture-sessions/:sessionId`
- `POST /v1/modules/modeling/capture-sessions/:sessionId/frames`
- `POST /v1/modules/modeling/capture-sessions/:sessionId/generate`
- `GET /v1/modules/modeling/models/:modelId`
- `GET /v1/modules/modeling/health`

## Agent Module

- `POST /v1/modules/agent/plan`
- `POST /v1/modules/agent/execute`
- `POST /v1/modules/agent/memory/upsert`
- `POST /v1/modules/agent/memory/query`
- `GET /v1/modules/agent/health`

## Community Module

- `GET /v1/modules/community/feed`
- `GET /v1/modules/community/me/posts`
- `POST /v1/modules/community/drafts`
- `PUT /v1/modules/community/drafts/:id`
- `POST /v1/modules/community/drafts/:id/publish`
- `POST /v1/modules/community/posts/:id/like`
- `POST /v1/modules/community/posts/:id/save`
- `GET /v1/modules/community/posts/:id/comments`
- `POST /v1/modules/community/posts/:id/comments`
- `GET /v1/modules/community/health`

## Account/Auth (kept for login/profile)

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `GET /v1/profile/me`
- `PATCH /v1/profile/me`
- `PATCH /v1/profile/me/settings`

## Smoke Test

```bash
npm run precheck:strict
npm run test:smoke
```

`test:smoke` validates all five modules against `/v1/modules/*`.
