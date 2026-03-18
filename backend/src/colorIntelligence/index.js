const express = require('express');
const {fetchProviderModelIds} = require('../providers');
const {
  getAutoGradePhaseRuntimeConfig,
  getAutoGradeModelConfig,
} = require('../autoGrade');
const {createModelHealthStore} = require('./health/modelHealth');
const {handleInterpret} = require('./services/interpretService');
const {handleAutoGrade} = require('./services/autoGradeService');
const {handleSegmentation} = require('./services/segmentationService');
const {
  withInterpretCompat,
  withAutoGradeCompat,
  withSegmentationCompat,
} = require('./adapters/compat');

const modelHealthStore = createModelHealthStore({
  getAutoGradeModelConfig,
  fetchProviderModelIds,
});

const createColorIntelligenceRouter = () => {
  const router = express.Router();

  router.post('/interpret', async (req, res) => {
    const result = await handleInterpret(req.body);
    if (result.status >= 500 && !result.payload.intent_actions) {
      res.status(result.status).json(result.payload);
      return;
    }
    res.status(result.status).json(withInterpretCompat(result.payload));
  });

  router.post('/auto-grade', async (req, res) => {
    const result = await handleAutoGrade(req.body, modelHealthStore.getModelHealthSnapshot());
    if (result.status !== 200) {
      res.status(result.status).json(result.payload);
      return;
    }
    res.status(200).json(withAutoGradeCompat(result.payload));
  });

  router.post('/segment', async (req, res) => {
    const result = handleSegmentation(req.body);
    if (result.status !== 200) {
      res.status(result.status).json(result.payload);
      return;
    }
    res.status(200).json(withSegmentationCompat(result.payload));
  });

  return router;
};

const refreshModelHealth = async () => modelHealthStore.refreshModelHealth();

const markModelHealthError = error => modelHealthStore.markModelHealthError(error);

const getRuntimeSnapshot = () => ({
  phaseRuntime: getAutoGradePhaseRuntimeConfig(),
  modelChains: getAutoGradeModelConfig(),
  ...modelHealthStore.getModelHealthSnapshot(),
});

module.exports = {
  createColorIntelligenceRouter,
  refreshModelHealth,
  markModelHealthError,
  getRuntimeSnapshot,
};
