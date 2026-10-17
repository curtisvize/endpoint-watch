import type { CheckStatus } from '../monitoring/check-endpoint.js';

// pg returns bigint as strings and timestamptz as Date by default.
export interface MonitorRecord {
  id: string;
  name: string;
  url: string;
  interval_seconds: number;
  enabled: boolean;
  created_at: Date;
}

export interface CheckResultRecord {
  id: string;
  monitor_id: string;
  checked_at: Date;
  outcome: CheckStatus;
  status_code: number | null;
  response_time_ms: number;
  error_message: string | null;
}

export type NewCheckResult = Omit<CheckResultRecord, 'id'>;
