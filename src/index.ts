import { createServer } from './api/server.js';
import { env } from './config/index.js';
import { whaleMonitor } from './services/monitor/WhaleMonitor.js';
import { bloomFilterService } from './services/entity/BloomFilterService.js';

const app = createServer();

const server = app.listen(env.PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   TokenSee API v0.1.0                ║
  ║   Invisible Infrastructure           ║
  ╚══════════════════════════════════════╝

  Running on: http://localhost:${env.PORT}
  Environment: ${env.NODE_ENV}

  Endpoints:
    GET  /health
    POST /v1/tx/decode
    GET  /v1/alerts
    GET  /v1/address/:addr/entity
  `);

  // Start Bloom Filter async load (non-blocking, lookups degrade gracefully until ready)
  bloomFilterService.init();

  // Start whale monitor background worker
  whaleMonitor.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  whaleMonitor.stop();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  whaleMonitor.stop();
  server.close(() => {
    process.exit(0);
  });
});
