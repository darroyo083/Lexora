CREATE TABLE IF NOT EXISTS book_pages (
    id UUID PRIMARY KEY,
    book_id UUID NOT NULL REFERENCES books(id),
    page_number INTEGER NOT NULL,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    processing_status TEXT NOT NULL DEFAULT 'PENDING',
    analysis JSONB,
    processed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    UNIQUE (book_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_book_pages_book ON book_pages(book_id);
