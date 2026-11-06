ALTER TABLE source_collection_policies
  ADD COLUMN cadence_hours integer NOT NULL DEFAULT 24
  CHECK (cadence_hours BETWEEN 6 AND 168);
