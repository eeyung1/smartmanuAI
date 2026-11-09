CREATE TABLE opportunity_source_aliases (
  opportunity_id text NOT NULL REFERENCES opportunities(id),
  source_id text NOT NULL REFERENCES sources(id),
  recorded_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(opportunity_id,source_id)
);
CREATE INDEX opportunity_source_aliases_source ON opportunity_source_aliases(source_id);
ALTER TABLE opportunity_source_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON opportunity_source_aliases FROM PUBLIC;
