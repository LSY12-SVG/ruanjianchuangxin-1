function createLogger() {
  return {
    info(message, fields = {}) {
      console.log(`[image-to-3d] ${message}`, fields);
    },
    error(message, fields = {}) {
      console.error(`[image-to-3d] ${message}`, fields);
    },
  };
}

module.exports = {
  createLogger,
};
