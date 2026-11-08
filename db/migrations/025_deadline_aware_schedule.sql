ALTER TABLE source_collection_policies
  ADD COLUMN schedule_mode text NOT NULL DEFAULT 'fixed' CHECK(schedule_mode IN ('fixed','deadline_aware')),
  ADD COLUMN last_scheduled_at timestamptz;
CREATE INDEX opportunities_source_deadline ON opportunities(source_id,(details->>'deadline')) WHERE state='published';
