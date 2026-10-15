export interface MonitorTarget {
  name: string;
  url: string;
  timeoutMs: number;
}

export type CheckStatus = 'healthy' | 'http_error' | 'timeout' | 'connection_error';

export interface CheckResult {
  target: string;
  status: CheckStatus;
  statusCode: number | null;
  responseTimeMs: number;
  checkedAt: string;
  error: string | null;
}

// Targets must come from trusted application configuration, never request input.
export async function checkEndpoint(
  target: MonitorTarget,
  httpClient: typeof fetch = fetch,
): Promise<CheckResult> {
  const checkedAt = new Date().toISOString();
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), target.timeoutMs);

  try {
    const response = await httpClient(target.url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    const responseTimeMs = performance.now() - startedAt;

    // Evaluation ends at headers; release the unused body without waiting for it.
    void response.body?.cancel().catch(() => {});

    return {
      target: target.name,
      status: response.status >= 200 && response.status <= 299 ? 'healthy' : 'http_error',
      statusCode: response.status,
      responseTimeMs,
      checkedAt,
      error: null,
    };
  } catch {
    const timedOut = controller.signal.aborted;
    return {
      target: target.name,
      status: timedOut ? 'timeout' : 'connection_error',
      statusCode: null,
      responseTimeMs: performance.now() - startedAt,
      checkedAt,
      error: timedOut ? 'Request timed out' : 'Unable to connect to target',
    };
  } finally {
    clearTimeout(timer);
  }
}
