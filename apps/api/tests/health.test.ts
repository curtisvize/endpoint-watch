import { once } from 'node:events';
import { get } from 'node:http';
import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';

it('GET /health returns HTTP 200 and an ok status', async () => {
  const app = createApp({ name: 'Test', url: 'https://example.test', timeoutMs: 5000 });
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    const result = await new Promise<{
      statusCode: number | undefined;
      contentType: string | undefined;
      body: string;
    }>((resolve, reject) => {
      const request = get(`http://127.0.0.1:${address.port}/health`, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => { body += chunk; });
        response.on('error', reject);
        response.on('end', () => resolve({
          statusCode: response.statusCode,
          contentType: response.headers['content-type'],
          body,
        }));
      });
      request.on('error', reject);
    });

    expect(result.statusCode).toBe(200);
    expect(result.contentType).toContain('application/json');
    expect(JSON.parse(result.body)).toEqual({ status: 'ok' });
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }
});
