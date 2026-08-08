CREATE TABLE IF NOT EXISTS answer_keys (
    book_id UUID NOT NULL UNIQUE REFERENCES books(id) ON DELETE CASCADE,
    extraction_method VARCHAR(100) NOT NULL,
    parser_version VARCHAR(100) NOT NULL,
    source_page_range VARCHAR(100),
    extraction_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    failure_reason TEXT,
    extracted_at TIMESTAMPTZ,
    entries JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_answer_keys_extraction_status ON answer_keys(extraction_status);
