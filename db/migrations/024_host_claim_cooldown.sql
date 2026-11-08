ALTER TABLE collection_host_locks
  ADD COLUMN request_delay_seconds integer NOT NULL DEFAULT 0 CHECK(request_delay_seconds BETWEEN 0 AND 3600),
  ADD COLUMN last_claim_at timestamptz,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
