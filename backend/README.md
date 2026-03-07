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
