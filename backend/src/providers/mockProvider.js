function createMockProvider({ resultUrl }) {
  const jobs = new Map();

  return {
    name: 'mock',
    async submitJob() {
      const providerJobId = `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      jobs.set(providerJobId, { queryCount: 0 });
      return { providerJobId };
    },
    async getJob({ providerJobId }) {
      const job = jobs.get(providerJobId);

      if (!job) {
        return {
          rawStatus: 'FAIL',
          errorCode: 'MOCK_NOT_FOUND',
          errorMessage: 'Mock provider job was not found.',
          files: [],
        };
      }

      job.queryCount += 1;

      if (job.queryCount === 1) {
        return { rawStatus: 'WAIT', files: [] };
      }

      if (job.queryCount === 2) {
        return { rawStatus: 'RUN', files: [] };
      }

      return {
        rawStatus: 'DONE',
        files: [
          {
            Type: 'GLB',
            Url: resultUrl,
            PreviewImageUrl: 'https://modelviewer.dev/shared-assets/models/poster-astronaut.webp',
          },
        ],
      };
    },
  };
}

module.exports = {
  createMockProvider,
};
