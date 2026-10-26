import { createMockApp } from './mock/app.js';

const delayMs = Number(process.env.MOCK_DELAY_MS ?? 6000);
if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 2_147_483_647) {
  throw new Error('MOCK_DELAY_MS must be an integer between 0 and 2147483647');
}
const server = createMockApp(delayMs).listen(3000, '0.0.0.0');
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
