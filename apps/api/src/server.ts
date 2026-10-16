import { createApp } from './app.js';
import { loadMonitorTarget } from './config.js';

const port = 3000;
const host = process.env.HOST ?? '127.0.0.1';
const app = createApp(loadMonitorTarget());

app.listen(port, host, () => {
  console.log(`Endpoint Watch API listening on http://${host}:${port}`);
});
