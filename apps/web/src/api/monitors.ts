export interface Monitor {
  id: string;
  name: string;
  intervalSeconds: number;
  enabled: boolean;
  createdAt: string;
}
export interface CheckHistoryEntry {
  id: string;
  monitorId: string;
  checkedAt: string;
  outcome: 'healthy' | 'http_error' | 'timeout' | 'connection_error';
  statusCode: number | null;
  responseTimeMs: number;
  error: string | null;
}
export interface DataResponse<T> { data: T }
export interface ErrorResponse { error: string }
export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}
export const API_REQUEST_TIMEOUT_MS = 10_000;
export class ApiTimeoutError extends ApiError {
  constructor() {
    super('Monitoring API request timed out.');
    this.name = 'ApiTimeoutError';
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  let rejectCancellation!: (reason: unknown) => void;
  const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
  const onAbort = () => rejectCancellation(controller.signal.reason);
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new ApiTimeoutError()), API_REQUEST_TIMEOUT_MS);
  try {
    // Settle even if a stalled client/body reader does not honor cancellation.
    return await Promise.race([read<T>(path, controller.signal), cancellation]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: 'GET', signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Unable to reach the monitoring API.');
  }
  if (!response.ok) throw new ApiError(`Monitoring API request failed (HTTP ${response.status}).`, response.status);
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('data' in body)) throw new Error('Missing data');
    // Record shapes follow the backend contract; the envelope is checked here.
    return (body as DataResponse<T>).data;
  } catch {
    throw new ApiError('The monitoring API returned an invalid response.');
  }
}
export function listMonitors(signal?: AbortSignal): Promise<Monitor[]> {
  return get<Monitor[]>('/api/monitors', signal);
}
export function getMonitor(id: string, signal?: AbortSignal): Promise<Monitor> {
  return get<Monitor>(`/api/monitors/${encodeURIComponent(id)}`, signal);
}
export function getRecentChecks(id: string, limit = 20, signal?: AbortSignal): Promise<CheckHistoryEntry[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    return Promise.reject(new RangeError('Limit must be an integer between 1 and 1000'));
  }
  return get<CheckHistoryEntry[]>(`/api/monitors/${encodeURIComponent(id)}/checks?limit=${limit}`, signal);
}
