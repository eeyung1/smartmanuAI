-- Hosted reader grants and state-scoped policies are managed by the staging bootstrap.
CREATE INDEX opportunity_source_aliases_browse
  ON opportunity_source_aliases(opportunity_id,recorded_at,source_id);
