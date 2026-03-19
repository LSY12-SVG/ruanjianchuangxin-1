# Frontend / Backend Architecture

## Boundaries

- Frontend scope: root files, `src/`, `android/`, `ios/`.
- Backend scope: `backend/`.
- Shared contract: HTTP endpoints only.

Do not import backend files from frontend modules.

## Data Flow

1. UI screen or hook triggers an action.
2. Frontend API modules call backend endpoints.
3. Backend modules validate input, execute business logic, then return JSON.
4. Frontend normalizes response and updates state/UI.

## Source of Truth

- Frontend state: `src/store` + query cache.
- Backend persistence: `backend/data/*.sqlite` and backend services.
- API contracts: backend route handlers plus frontend API adapters.

## Local Development

- Start backend first (`npm run backend:start` from root or `npm start` in `backend/`).
- Start frontend Metro (`npm run frontend:start`).
- Launch app (`npm run android` or `npm run ios`).
