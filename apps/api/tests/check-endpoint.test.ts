import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkEndpoint, type MonitorTarget } from '../src/monitoring/check-endpoint.js';

const target: MonitorTarget = {
  name: 'Example Service',
  url: 'https://example.test/health',
  timeoutMs: 5000,
};

describe('checkEndpoint', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    vi.setSystemTime(new Date('2026-10-15T19:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([200, 204, 299])('classifies HTTP %i as healthy', async (statusCode) => {
    const client = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 142));
      return new Response(null, { status: statusCode });
    });

    const pending = checkEndpoint(target, client);
    await vi.advanceTimersByTimeAsync(142);

    expect(await pending).toEqual({
      target: target.name,
      status: 'healthy',
      statusCode,
      responseTimeMs: 142,
      checkedAt: '2026-10-15T19:00:00.000Z',
      error: null,
    });
    expect(client).toHaveBeenCalledWith(target.url, {
      method: 'GET',
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([300, 302, 404, 500])('classifies HTTP %i as http_error', async (statusCode) => {
    const client = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: statusCode }));

    expect(await checkEndpoint(target, client)).toMatchObject({
      status: 'http_error', statusCode, error: null,
    });
    expect(client).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a timed-out request and returns a structured timeout result', async () => {
    const client = vi.fn<typeof fetch>().mockImplementation((_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }),
    );

    const pending = checkEndpoint(target, client);
    await vi.advanceTimersByTimeAsync(target.timeoutMs);

    expect(await pending).toEqual({
      target: target.name,
      status: 'timeout',
      statusCode: null,
      responseTimeMs: 5000,
      checkedAt: '2026-10-15T19:00:00.000Z',
      error: 'Request timed out',
    });
    expect(client.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns sanitized network failures and clears the timeout', async () => {
    const client = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError('Connection failed: https://user:secret@example.test'),
    );

    expect(await checkEndpoint(target, client)).toEqual({
      target: target.name,
      status: 'connection_error',
      statusCode: null,
      responseTimeMs: 0,
      checkedAt: '2026-10-15T19:00:00.000Z',
      error: 'Unable to connect to target',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses built-in fetch by default and cancels the unused response body', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const response = new Response(new ReadableStream({ cancel }));
    const client = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', client);

    expect(await checkEndpoint(target)).toMatchObject({ status: 'healthy', statusCode: 200 });
    expect(client).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
