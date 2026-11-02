CREATE TABLE source_retry_after (
 source_id text PRIMARY KEY REFERENCES sources(id),
 retry_after_at timestamptz,
 requires_review boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT NOW(),
 CHECK(retry_after_at IS NOT NULL OR requires_review)
);
