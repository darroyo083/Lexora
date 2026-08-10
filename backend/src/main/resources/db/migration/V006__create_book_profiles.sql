-- BookProfile stores source-specific page structure without bundling any
-- commercial or private workbook profile in the public repository.

CREATE TABLE IF NOT EXISTS book_profiles (
    id UUID PRIMARY KEY,
    publisher VARCHAR(100) NOT NULL,
    edition_key VARCHAR(200) NOT NULL UNIQUE,
    metadata JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE books ADD COLUMN IF NOT EXISTS book_profile_id UUID REFERENCES book_profiles(id);

CREATE INDEX IF NOT EXISTS idx_books_book_profile_id ON books(book_profile_id);
