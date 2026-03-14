const express = require('express');
const {validateSegmentationRequest} = require('./validators');
const {createSegmentationResult} = require('./service');

const createSegmentationRouter = () => {
  const router = express.Router();

  router.post('/segment', async (req, res) => {
    const validation = validateSegmentationRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({error: validation.message});
      return;
    }

    try {
      const result = createSegmentationResult(req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: 'segmentation_failed',
        message: error instanceof Error ? error.message : 'unknown segmentation error',
      });
    }
  });

  return router;
};

const initializeSegmentationModule = async () => ({
  enabled: true,
  router: createSegmentationRouter(),
});

module.exports = {
  createSegmentationRouter,
  initializeSegmentationModule,
};
