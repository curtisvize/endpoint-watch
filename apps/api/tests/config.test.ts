import { expect, it } from 'vitest';
import { loadMonitorTarget } from '../src/config.js';

const valid = { MONITOR_NAME: 'Test Service', MONITOR_URL: 'https://example.test/health' };

it('loads the target with the default timeout', () => {
  expect(loadMonitorTarget(valid)).toEqual({ name: 'Test Service', url: valid.MONITOR_URL, timeoutMs: 5000 });
});

it('supports HTTP and a configured timeout', () => {
  expect(loadMonitorTarget({ ...valid, MONITOR_URL: 'http://localhost/health', MONITOR_TIMEOUT_MS: '1234' }))
    .toEqual({ name: valid.MONITOR_NAME, url: 'http://localhost/health', timeoutMs: 1234 });
});

it.each(['MONITOR_NAME', 'MONITOR_URL'] as const)('rejects missing or blank %s', (key) => {
  expect(() => loadMonitorTarget({ ...valid, [key]: undefined })).toThrow(key);
  expect(() => loadMonitorTarget({ ...valid, [key]: '  ' })).toThrow(key);
});

it.each(['invalid', 'ftp://example.test', 'https://user:secret@'])('rejects invalid URLs without exposing them: %s', (url) => {
  expect(() => loadMonitorTarget({ ...valid, MONITOR_URL: url }))
    .toThrow('MONITOR_URL must be a valid HTTP or HTTPS URL');
});

it.each(['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '2147483648'])('rejects invalid timeout %j', (timeout) => {
  expect(() => loadMonitorTarget({ ...valid, MONITOR_TIMEOUT_MS: timeout })).toThrow('MONITOR_TIMEOUT_MS');
});
