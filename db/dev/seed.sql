\set ON_ERROR_STOP on
BEGIN;
-- Development targets only. Repeated starts do not duplicate or reset monitors.
SELECT pg_advisory_xact_lock(621904, 2);
INSERT INTO monitors (name, url, interval_seconds)
SELECT seed.name, seed.url, 10
FROM (VALUES
    ('Mock healthy', 'http://mock-api:3000/health'),
    ('Mock HTTP error', 'http://mock-api:3000/error'),
    ('Mock delayed', 'http://mock-api:3000/delay')
) AS seed(name, url)
WHERE NOT EXISTS (SELECT 1 FROM monitors m WHERE m.name = seed.name AND m.url = seed.url);
COMMIT;
