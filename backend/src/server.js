require('dotenv').config();

const cors = require('cors');
const express = require('express');
const {validateInterpretRequest, normalizeInterpretResponse} = require('./contracts');
const {interpretWithProvider} = require('./providers');

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({limit: '4mb'}));

app.get('/health', (_req, res) => {
  res.json({ok: true, service: 'visiongenie-color-agent-proxy'});
});

app.post('/v1/color/interpret', async (req, res) => {
  const validation = validateInterpretRequest(req.body);
  if (!validation.ok) {
    res.status(400).json({
      error: validation.message,
    });
    return;
  }

  const requestPayload = {
    mode: req.body.mode,
    transcript: req.body.transcript,
    currentParams: req.body.currentParams,
    locale: req.body.locale,
    sceneHints: Array.isArray(req.body.sceneHints) ? req.body.sceneHints : [],
    image: req.body.image,
    imageStats: req.body.imageStats,
  };

  const providerResult = await interpretWithProvider(requestPayload);
  const interpreted = normalizeInterpretResponse(providerResult);

  if (!interpreted) {
    res.status(502).json({
      intent_actions: [],
      confidence: 0,
      reasoning_summary: 'provider returned invalid schema',
      fallback_used: true,
      needsConfirmation: true,
      message: '语义服务暂时不可用',
      source: 'fallback',
      analysis_summary: '',
      applied_profile: '',
    });
    return;
  }

  console.log(
    '[voice-agent-proxy] metrics',
    JSON.stringify({
      model_used:
        typeof providerResult?.model_used === 'string'
          ? providerResult.model_used
          : 'unknown',
      latency_ms:
        typeof providerResult?.latency_ms === 'number'
          ? providerResult.latency_ms
          : -1,
      fallback_used: interpreted.fallback_used,
      confidence: interpreted.confidence,
    }),
  );

  res.json(interpreted);
});

app.listen(port, () => {
  console.log(`[voice-agent-proxy] listening on :${port}`);
});
