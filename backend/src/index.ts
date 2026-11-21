import { startServer, stopServer } from './server';

startServer().catch((e) => {
  console.error('❌ Không khởi động được StayManager:', e);
  process.exit(1);
});

async function shutdown() {
  await stopServer();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
