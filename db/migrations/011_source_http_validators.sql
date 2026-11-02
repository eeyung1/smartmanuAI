CREATE UNIQUE INDEX source_snapshot_identity ON source_snapshots(id,source_id);
CREATE TABLE source_http_validators (
 source_id text PRIMARY KEY REFERENCES sources(id),
 snapshot_id text NOT NULL,
 url text NOT NULL,
 etag text CHECK(etag IS NULL OR length(etag)<=512),
 last_modified text CHECK(last_modified IS NULL OR length(last_modified)=29),
 updated_at timestamptz NOT NULL DEFAULT NOW(),
 FOREIGN KEY(snapshot_id,source_id) REFERENCES source_snapshots(id,source_id)
);
