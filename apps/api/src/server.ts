import { createApp } from './app.js';
import { loadMonitorTarget } from './config.js';

const port = 3000;
const app = createApp(loadMonitorTarget());

app.listen(port, '127.0.0.1', () => {
  console.log(`Endpoint Watch API listening on http://127.0.0.1:${port}`);
});
