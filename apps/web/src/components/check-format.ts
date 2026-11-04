export const outcomeLabels = {
  healthy: 'Healthy', http_error: 'HTTP error', timeout: 'Timeout', connection_error: 'Connection error',
};
export function localCheckTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(timestamp));
}
