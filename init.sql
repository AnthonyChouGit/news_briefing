CREATE TABLE IF NOT EXISTS brief_news (
    hash_id TEXT PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    source_date TIMESTAMPTZ NOT NULL,
    source_name TEXT NOT NULL,
    category TEXT NOT NULL,
    bullets TEXT[],
    raw TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brief_news_source_date ON brief_news(source_date);
