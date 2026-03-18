const DEFAULT_MODEL_CHECK_TIMEOUT_MS = 6000;

const toNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const createModelHealthStore = ({getAutoGradeModelConfig, fetchProviderModelIds}) => {
  const state = {
    refineModelReady: true,
    missingModelIds: [],
    lastCheckedAt: null,
    modelCheckError: null,
  };

  const refreshModelHealth = async () => {
    const modelConfig = getAutoGradeModelConfig();
    const refineModels = Array.isArray(modelConfig.refineModelChain)
      ? modelConfig.refineModelChain.filter(Boolean)
      : [];

    const checkedAt = new Date().toISOString();
    if (!refineModels.length) {
      state.refineModelReady = false;
      state.missingModelIds = [];
      state.lastCheckedAt = checkedAt;
      state.modelCheckError = 'missing_refine_model_config';
      return state;
    }

    const probe = await fetchProviderModelIds({
      timeoutMs: toNumber(process.env.MODEL_LIST_TIMEOUT_MS, DEFAULT_MODEL_CHECK_TIMEOUT_MS),
    });

    if (!probe.ok) {
      state.refineModelReady = false;
      state.missingModelIds = refineModels;
      state.lastCheckedAt = checkedAt;
      state.modelCheckError = probe.error || 'model_list_probe_failed';
      return state;
    }

    const remoteSet = new Set(probe.modelIds);
    const missing = refineModels.filter(modelId => !remoteSet.has(modelId));
    state.refineModelReady = missing.length === 0;
    state.missingModelIds = missing;
    state.lastCheckedAt = checkedAt;
    state.modelCheckError = missing.length === 0 ? null : 'refine_model_not_in_provider_catalog';
    return state;
  };

  const getModelHealthSnapshot = () => ({
    refineModelReady: state.refineModelReady,
    missingModelIds: [...state.missingModelIds],
    lastCheckedAt: state.lastCheckedAt,
    modelCheckError: state.modelCheckError,
  });

  const markModelHealthError = error => {
    state.refineModelReady = false;
    state.lastCheckedAt = new Date().toISOString();
    state.modelCheckError = String(error?.message || 'model_check_failed');
  };

  return {
    refreshModelHealth,
    getModelHealthSnapshot,
    markModelHealthError,
  };
};

module.exports = {
  createModelHealthStore,
};
