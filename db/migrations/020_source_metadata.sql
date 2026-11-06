ALTER TABLE sources
  ADD COLUMN source_type text NOT NULL DEFAULT 'unknown' CHECK (source_type IN ('unknown','university','government','scholarship_body','training_provider','event_organizer','other')),
  ADD COLUMN source_language text NOT NULL DEFAULT 'unknown' CHECK (source_language IN ('unknown','en','zh','multilingual','other')),
  ADD COLUMN metadata_version integer NOT NULL DEFAULT 1 CHECK (metadata_version > 0);
