const {validateSegmentationRequest} = require('../../segmentation/validators');
const {createSegmentationResult} = require('../../segmentation/service');
const {normalizeSegmentationRequest} = require('../contracts/segmentation');

const handleSegmentation = requestBodyRaw => {
  const requestBody = normalizeSegmentationRequest(requestBodyRaw);
  const validation = validateSegmentationRequest(requestBody);
  if (!validation.ok) {
    return {
      status: 400,
      payload: {error: validation.message},
    };
  }

  try {
    const result = createSegmentationResult(requestBody);
    return {
      status: 200,
      payload: result,
    };
  } catch (error) {
    return {
      status: 500,
      payload: {
        error: 'segmentation_failed',
        message: error instanceof Error ? error.message : 'unknown segmentation error',
      },
    };
  }
};

module.exports = {
  handleSegmentation,
};
