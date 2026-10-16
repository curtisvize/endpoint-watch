CREATE TABLE monitors (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    url text NOT NULL CHECK (url ~* '^https?://[^[:space:]/?#]+[^[:space:]]*$'),
    interval_seconds integer NOT NULL DEFAULT 60 CHECK (interval_seconds > 0),
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE check_results (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    monitor_id bigint NOT NULL REFERENCES monitors(id) ON DELETE RESTRICT,
    checked_at timestamptz NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('healthy', 'http_error', 'timeout', 'connection_error')),
    status_code smallint CHECK (status_code BETWEEN 100 AND 599),
    response_time_ms double precision NOT NULL
        CHECK (response_time_ms >= 0 AND response_time_ms < 'Infinity'::double precision),
    error_message text,
    CONSTRAINT check_results_outcome_consistency CHECK (
        (outcome = 'healthy' AND status_code IS NOT NULL AND status_code BETWEEN 200 AND 299 AND error_message IS NULL)
        OR (outcome = 'http_error' AND status_code IS NOT NULL AND status_code NOT BETWEEN 200 AND 299 AND error_message IS NULL)
        OR (outcome IN ('timeout', 'connection_error') AND status_code IS NULL
            AND error_message IS NOT NULL AND length(btrim(error_message)) > 0)
    )
);

CREATE INDEX check_results_recent_by_monitor
    ON check_results (monitor_id, checked_at DESC, id DESC);
