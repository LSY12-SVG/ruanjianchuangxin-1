# VisionGenieApp

VisionGenieApp is split into two parts:

- Frontend (React Native mobile app): project root
- Backend (Node.js API service): `backend/`

## Project Structure

```text
VisionGenieApp/
  App.tsx
  src/                  # frontend app code
  android/ ios/         # native shells for the frontend
  __tests__/            # frontend + backend unit tests
  backend/
    src/                # backend API server
    scripts/            # backend smoke/account/precheck scripts
    migrations/         # backend SQL migrations
    data/               # backend runtime data and mock seed assets
```

## Run Frontend

```bash
npm install
npm run frontend:start
npm run android
# or
npm run ios
```

## Run Backend

```bash
cd backend
npm install
npm start
```

Or from the root:

```bash
npm run backend:start
```

## Architecture Rules

- Frontend code under `src/` can only communicate with backend through HTTP API calls.
- Frontend code must not import files from `backend/` directly.
- Backend must not depend on the frontend package.

These rules are enforced in lint config (`no-restricted-imports` for `src/**`).

## Common Dev Commands

```bash
npm test
npm run lint
npm run backend:start
```
