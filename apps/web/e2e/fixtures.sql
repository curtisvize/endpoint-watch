\set ON_ERROR_STOP on
-- Disposable E2E database only. Never run against development data.
BEGIN;
TRUNCATE check_results, monitors RESTART IDENTITY;
INSERT INTO monitors (name, url, enabled) VALUES
    ('E2E Healthy', 'http://mock-api:3000/health', true),
    ('E2E Failed', 'http://mock-api:3000/error', true),
    ('E2E Unchecked', 'http://mock-api:3000/health', false);
INSERT INTO check_results (monitor_id, checked_at, outcome, status_code, response_time_ms, error_message) VALUES
    (1, '2026-11-04T12:00:00Z', 'healthy', 200, 12.5, NULL),
    (1, '2026-11-04T11:00:00Z', 'timeout', NULL, 5000, 'Request timed out'),
    (2, '2026-11-04T12:00:00Z', 'http_error', 500, 7.25, NULL);
COMMIT;
