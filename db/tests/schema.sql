\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
    monitor bigint;
    result_id bigint;
    latest_id bigint;
    defaults monitors%ROWTYPE;
BEGIN
    INSERT INTO monitors (name, url) VALUES ('Schema test', 'https://example.test/health')
        RETURNING * INTO defaults;
    monitor := defaults.id;
    IF defaults.interval_seconds <> 60 OR NOT defaults.enabled OR defaults.created_at IS NULL THEN
        RAISE EXCEPTION 'Unexpected monitor defaults';
    END IF;

    INSERT INTO check_results (monitor_id, checked_at, outcome, status_code, response_time_ms)
        VALUES (monitor, '2026-10-16T10:00:00-07:00', 'healthy', 200, 12.5);
    INSERT INTO check_results (monitor_id, checked_at, outcome, status_code, response_time_ms)
        VALUES (monitor, '2026-10-16T17:00:00Z', 'http_error', 302, 0) RETURNING id INTO result_id;
    SELECT id INTO latest_id FROM check_results WHERE monitor_id = monitor
        ORDER BY checked_at DESC, id DESC LIMIT 1;
    IF latest_id <> result_id THEN RAISE EXCEPTION 'Incorrect recent-history ordering'; END IF;
    IF (SELECT count(DISTINCT checked_at) FROM check_results WHERE monitor_id = monitor) <> 1 THEN
        RAISE EXCEPTION 'Timezone offsets did not represent the same instant';
    END IF;

    INSERT INTO check_results (monitor_id, checked_at, outcome, response_time_ms, error_message)
        VALUES (monitor, now(), 'timeout', 5000, 'Request timed out'),
               (monitor, now(), 'connection_error', 1.25, 'Unable to connect to target');

    BEGIN
        INSERT INTO monitors (name, url) VALUES (' ', 'https://example.test');
        RAISE EXCEPTION 'Blank name accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO monitors (name, url) VALUES ('Bad URL', 'ftp://example.test');
        RAISE EXCEPTION 'Invalid URL accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE monitors SET interval_seconds = 0 WHERE id = monitor;
        RAISE EXCEPTION 'Invalid interval accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO check_results (monitor_id, checked_at, outcome, status_code, response_time_ms)
            VALUES (-1, now(), 'healthy', 200, 1);
        RAISE EXCEPTION 'Missing monitor accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        DELETE FROM monitors WHERE id = monitor;
        RAISE EXCEPTION 'Monitor with history deleted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        UPDATE check_results SET outcome = 'unknown' WHERE monitor_id = monitor;
        RAISE EXCEPTION 'Invalid outcome accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE check_results SET status_code = 600 WHERE id = result_id;
        RAISE EXCEPTION 'Invalid HTTP status accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE check_results SET outcome = 'healthy', status_code = 500 WHERE id = result_id;
        RAISE EXCEPTION 'Inconsistent HTTP outcome accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE check_results SET status_code = NULL WHERE id = result_id;
        RAISE EXCEPTION 'HTTP outcome without status accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE check_results SET outcome = 'timeout', status_code = NULL, error_message = NULL WHERE id = result_id;
        RAISE EXCEPTION 'Failure without diagnostic accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE check_results SET response_time_ms = -1 WHERE id = result_id;
        RAISE EXCEPTION 'Negative duration accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE check_results SET response_time_ms = 'NaN' WHERE id = result_id;
        RAISE EXCEPTION 'NaN duration accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE check_results SET response_time_ms = 'Infinity' WHERE id = result_id;
        RAISE EXCEPTION 'Infinite duration accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
        AND indexname = 'check_results_recent_by_monitor') THEN
        RAISE EXCEPTION 'Missing history index';
    END IF;
END $$;

ROLLBACK;
