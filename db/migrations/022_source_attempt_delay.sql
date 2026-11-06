ALTER TABLE source_collection_policies
  ADD COLUMN request_delay_seconds integer NOT NULL DEFAULT 0 CHECK(request_delay_seconds BETWEEN 0 AND 3600),
  ADD COLUMN last_request_at timestamptz;
