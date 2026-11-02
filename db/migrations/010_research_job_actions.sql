CREATE TABLE research_job_actions (
 id text PRIMARY KEY,
 job_id text NOT NULL REFERENCES research_jobs(id),
 action text NOT NULL CHECK(action IN ('cancel','retry')),
 actor_id text NOT NULL REFERENCES auth_user(id),
 note text NOT NULL CHECK(length(note) BETWEEN 10 AND 1000),
 previous_state text NOT NULL CHECK(previous_state IN ('queued','running','failed','cancelled')),
 previous_attempts integer NOT NULL,
 replacement_job_id text REFERENCES research_jobs(id),
 created_at timestamptz NOT NULL DEFAULT NOW(),
 CHECK((action='retry')=(replacement_job_id IS NOT NULL))
);
CREATE UNIQUE INDEX research_job_single_retry ON research_job_actions(job_id) WHERE action='retry';
CREATE INDEX research_job_action_history ON research_job_actions(job_id,created_at,id);
CREATE INDEX research_job_action_replacement ON research_job_actions(replacement_job_id);
CREATE TRIGGER guard_research_job_actor BEFORE INSERT OR UPDATE ON research_job_actions FOR EACH ROW EXECUTE FUNCTION guard_pending_actor_write();
