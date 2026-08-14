CREATE TABLE IF NOT EXISTS assist_usage (
    usage_date DATE NOT NULL PRIMARY KEY,
    provider_calls INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assist_cache (
    cache_key VARCHAR(64) NOT NULL PRIMARY KEY,
    action VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    verdict VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assist_cache_created ON assist_cache(created_at);

CREATE TABLE IF NOT EXISTS assist_sessions (
    session_id VARCHAR(64) NOT NULL PRIMARY KEY,
    verified_until TIMESTAMPTZ,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    call_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
