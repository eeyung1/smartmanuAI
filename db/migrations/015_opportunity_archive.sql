ALTER TABLE opportunities DROP CONSTRAINT opportunities_state_check;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_state_check
  CHECK (state IN ('draft', 'published', 'closed', 'rejected', 'archived'));
