const config = require('./config');
const { createApp } = require('./app');

const { app, dependencies } = createApp();
const server = app.listen(config.port, config.host, () => {
  const publicBaseUrl = config.publicBaseUrl || `http://${config.host}:${config.port}`;
  console.log(`[image-to-3d] backend listening on ${publicBaseUrl}`);
});

function shutdown() {
  server.close(() => {
    if (dependencies.db?.close) {
      dependencies.db.close();
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
