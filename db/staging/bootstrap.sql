CREATE ROLE "smartmanuai_owner" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE "smartmanuai_reader" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT "smartmanuai_owner" TO "postgres";
CREATE SCHEMA "smartmanuai" AUTHORIZATION "smartmanuai_owner";
SET LOCAL ROLE "smartmanuai_owner";
SET LOCAL search_path="smartmanuai",pg_catalog;
CREATE TABLE schema_migrations(name text PRIMARY KEY);
CREATE TABLE auth_user (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false, image text, created_at timestamp NOT NULL, updated_at timestamp NOT NULL);
CREATE TABLE auth_session (id text PRIMARY KEY, expires_at timestamp NOT NULL, token text NOT NULL UNIQUE, created_at timestamp NOT NULL, updated_at timestamp NOT NULL, ip_address text, user_agent text, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE);
CREATE INDEX auth_session_user ON auth_session(user_id);
CREATE TABLE auth_account (id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, access_token text, refresh_token text, id_token text, access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text, password text, created_at timestamp NOT NULL, updated_at timestamp NOT NULL);
CREATE TABLE auth_verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamp NOT NULL, created_at timestamp NOT NULL, updated_at timestamp NOT NULL);
CREATE INDEX auth_verification_identifier ON auth_verification(identifier);
CREATE TABLE profiles (user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE, preferences jsonb NOT NULL DEFAULT '{}');
CREATE TABLE saved_items (user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, opportunity_id text NOT NULL, status text NOT NULL CHECK (status IN ('interested','applying','applied')), PRIMARY KEY(user_id, opportunity_id));
CREATE TABLE notification_preferences (user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE, enabled boolean NOT NULL DEFAULT false, channel text NOT NULL DEFAULT 'email' CHECK(channel IN ('email','telegram')));
CREATE TABLE outbox (id text PRIMARY KEY, event_key text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','accepted','uncertain','suppressed')), payload jsonb NOT NULL);
CREATE TABLE sink_messages (event_key text PRIMARY KEY, channel text NOT NULL, payload jsonb NOT NULL);
CREATE TABLE budget (id integer PRIMARY KEY CHECK(id=1), limit_micros bigint NOT NULL CHECK(limit_micros>=0), reserved_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_micros>=0));
INSERT INTO budget(id,limit_micros) VALUES(1,3000000);

INSERT INTO schema_migrations(name) VALUES('001_local_spike.sql');
CREATE TABLE admin_roles (user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE);
CREATE TABLE sources (id text PRIMARY KEY, name text NOT NULL, url text NOT NULL UNIQUE, synthetic boolean NOT NULL DEFAULT false, created_by text NOT NULL REFERENCES auth_user(id), created_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE opportunities (id text PRIMARY KEY, source_id text NOT NULL REFERENCES sources(id), revision integer NOT NULL CHECK(revision>0), state text NOT NULL CHECK(state IN ('draft','published','closed','rejected')), details jsonb NOT NULL, evidence jsonb NOT NULL, verified_at timestamptz, updated_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE opportunity_revisions (opportunity_id text NOT NULL REFERENCES opportunities(id), revision integer NOT NULL, state text NOT NULL, details jsonb NOT NULL, evidence jsonb NOT NULL, actor_id text NOT NULL REFERENCES auth_user(id), note text NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW(), PRIMARY KEY(opportunity_id,revision));
CREATE INDEX opportunities_public ON opportunities(state,verified_at DESC,id);
CREATE INDEX saved_items_opportunity ON saved_items(opportunity_id);

INSERT INTO schema_migrations(name) VALUES('002_reviewed_catalogue.sql');
CREATE TABLE source_collection_policies (source_id text PRIMARY KEY REFERENCES sources(id), enabled boolean NOT NULL DEFAULT false, permission_note text NOT NULL, actor_id text NOT NULL REFERENCES auth_user(id), next_due_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE research_jobs (id text PRIMARY KEY, source_id text NOT NULL REFERENCES sources(id), state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed','cancelled')), attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT NOW(), lease_token text, lease_until timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX research_jobs_active_source ON research_jobs(source_id) WHERE state IN ('queued','running');
CREATE TABLE source_snapshots (id text PRIMARY KEY, source_id text NOT NULL REFERENCES sources(id), content_hash text NOT NULL, content text NOT NULL, fetched_at timestamptz NOT NULL DEFAULT NOW(), last_seen_at timestamptz NOT NULL DEFAULT NOW(), UNIQUE(source_id,content_hash));
CREATE TABLE research_candidates (id text PRIMARY KEY, snapshot_id text NOT NULL UNIQUE REFERENCES source_snapshots(id), state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','drafted','rejected')), opportunity_id text REFERENCES opportunities(id), extraction jsonb, created_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE research_usage (id text PRIMARY KEY, candidate_id text NOT NULL REFERENCES research_candidates(id), reserved_micros bigint NOT NULL, state text NOT NULL CHECK(state IN ('reserved','completed','uncertain')), model text NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW());
CREATE INDEX research_jobs_due ON research_jobs(state,available_at);

INSERT INTO schema_migrations(name) VALUES('003_source_pipeline.sql');
ALTER TABLE profiles ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE saved_items ADD COLUMN saved boolean NOT NULL DEFAULT true;
ALTER TABLE saved_items ADD COLUMN dismissed_fingerprint text;
ALTER TABLE saved_items ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE saved_items ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW();
CREATE INDEX saved_items_user_updated ON saved_items(user_id,updated_at DESC);
UPDATE profiles SET preferences=jsonb_set(preferences,'{nationality}',CASE WHEN upper(preferences->>'nationality') ~ '^[A-Z]{2}$' THEN to_jsonb(upper(preferences->>'nationality')) ELSE 'null'::jsonb END) WHERE preferences ? 'nationality';

INSERT INTO schema_migrations(name) VALUES('004_matching_tracker.sql');
ALTER TABLE notification_preferences ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE notification_preferences ADD COLUMN consent_version text;
ALTER TABLE notification_preferences ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE notification_preferences ADD COLUMN frequency text NOT NULL DEFAULT 'weekly' CHECK(frequency IN ('daily','weekly'));
ALTER TABLE notification_preferences ADD COLUMN next_due_at timestamptz;
CREATE TABLE notification_digests (id text PRIMARY KEY,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,preference_version integer NOT NULL,channel text NOT NULL CHECK(channel IN ('email','telegram')),slot text NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','accepted','suppressed')),created_at timestamptz NOT NULL DEFAULT NOW(),payload jsonb,UNIQUE(user_id,slot,preference_version));
CREATE UNIQUE INDEX notification_digest_pending ON notification_digests(user_id) WHERE state='queued';
CREATE TABLE notification_digest_events (user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,event_key text NOT NULL,opportunity_id text NOT NULL REFERENCES opportunities(id),fingerprint text NOT NULL,digest_id text NOT NULL REFERENCES notification_digests(id) ON DELETE CASCADE,state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','accepted')),PRIMARY KEY(user_id,event_key));
CREATE INDEX notification_digest_event_digest ON notification_digest_events(digest_id);
CREATE INDEX notification_preferences_due ON notification_preferences(next_due_at) WHERE enabled;

INSERT INTO schema_migrations(name) VALUES('005_notification_digests.sql');
CREATE TABLE telegram_link_tokens (token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,issued_at timestamptz NOT NULL DEFAULT NOW(),expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE INDEX telegram_link_token_user ON telegram_link_tokens(user_id,issued_at DESC);
CREATE TABLE telegram_bindings (user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,state text NOT NULL CHECK(state IN ('pending','active','revoked')),version integer NOT NULL DEFAULT 1,chat_hash text NOT NULL,encrypted_chat text NOT NULL,chat_suffix text NOT NULL,event_date bigint NOT NULL,update_id bigint NOT NULL,updated_at timestamptz NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX telegram_chat_owner ON telegram_bindings(chat_hash) WHERE state IN ('pending','active');
CREATE TABLE telegram_webhook_updates (update_id bigint PRIMARY KEY,processed_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE telegram_chat_events (chat_hash text PRIMARY KEY,event_date bigint NOT NULL,update_id bigint NOT NULL,blocked boolean NOT NULL);
CREATE TABLE telegram_connection_lock (id integer PRIMARY KEY CHECK(id=1));
INSERT INTO telegram_connection_lock(id) VALUES(1);

INSERT INTO schema_migrations(name) VALUES('006_telegram_links.sql');
ALTER TABLE notification_preferences ADD COLUMN email_consent_epoch integer NOT NULL DEFAULT 0;
CREATE TABLE notification_unsubscribe_tokens (nonce_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,consent_epoch integer NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE email_digest_attempts (message_id text PRIMARY KEY,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,recipient_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE email_webhook_events (event_id text PRIMARY KEY,message_id text NOT NULL,event_type text NOT NULL,recipient_hashes jsonb NOT NULL,applied boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT NOW());
CREATE INDEX email_event_message ON email_webhook_events(message_id);
CREATE TABLE email_suppressions (recipient_hash text PRIMARY KEY,reason text NOT NULL CHECK(reason IN ('bounce','complaint')),event_id text NOT NULL REFERENCES email_webhook_events(event_id),created_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE email_control_lock (id integer PRIMARY KEY CHECK(id=1));
INSERT INTO email_control_lock(id) VALUES(1);

INSERT INTO schema_migrations(name) VALUES('007_email_controls.sql');
CREATE TABLE delivery_simulations (id text PRIMARY KEY,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,digest_id text NOT NULL UNIQUE REFERENCES notification_digests(id),channel text NOT NULL CHECK(channel IN ('email','telegram')),preference_version integer NOT NULL,binding_version integer,sealed_request text NOT NULL,state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','sending','retry','quota_wait','accepted','failed','uncertain','suppressed')),attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT NOW(),first_attempt_at timestamptz,lease_token text,lease_until timestamptz,provider_id text,error_code text,mapping_pending boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT NOW());
CREATE INDEX delivery_simulation_due ON delivery_simulations(state,available_at);
CREATE TABLE delivery_simulation_quota (channel text NOT NULL,period_kind text NOT NULL CHECK(period_kind IN ('day','month')),period_key text NOT NULL,reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0),PRIMARY KEY(channel,period_kind,period_key));

INSERT INTO schema_migrations(name) VALUES('008_delivery_simulations.sql');
CREATE TABLE account_deletion_requests (id text PRIMARY KEY,user_id text UNIQUE REFERENCES auth_user(id) ON DELETE SET NULL,receipt_hash text NOT NULL UNIQUE,state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','done')),created_at timestamptz NOT NULL DEFAULT NOW(),completed_at timestamptz);
CREATE FUNCTION privacy_pending_email(address text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM auth_user u JOIN account_deletion_requests r ON r.user_id=u.id WHERE lower(u.email)=lower(address) AND r.state='queued') $$;
CREATE FUNCTION privacy_verification_email(payload text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN RETURN payload::jsonb->>'email'; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END $$;
CREATE FUNCTION guard_pending_account_write() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE owner_id text; BEGIN IF TG_TABLE_NAME='auth_user' THEN owner_id=NEW.id; ELSE owner_id=NEW.user_id; END IF; IF TG_OP='INSERT' THEN PERFORM id FROM auth_user WHERE id=owner_id FOR SHARE; END IF; IF EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=owner_id AND state='queued') THEN RAISE EXCEPTION 'Account deletion is pending' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
DO $$ DECLARE item text; BEGIN FOREACH item IN ARRAY ARRAY['auth_user','auth_session','auth_account','profiles','saved_items','notification_preferences','outbox','notification_digests','notification_digest_events','telegram_link_tokens','telegram_bindings','notification_unsubscribe_tokens','email_digest_attempts','delivery_simulations'] LOOP EXECUTE format('CREATE TRIGGER guard_account_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_pending_account_write()',item); END LOOP; END $$;
CREATE FUNCTION guard_pending_actor_write() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE actor text; BEGIN IF TG_TABLE_NAME='sources' THEN actor=NEW.created_by; ELSE actor=NEW.actor_id; END IF; PERFORM id FROM auth_user WHERE id=actor FOR SHARE; IF EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=actor AND state='queued') THEN RAISE EXCEPTION 'Account deletion is pending' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_source_actor BEFORE INSERT OR UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION guard_pending_actor_write();
CREATE TRIGGER guard_revision_actor BEFORE INSERT OR UPDATE ON opportunity_revisions FOR EACH ROW EXECUTE FUNCTION guard_pending_actor_write();
CREATE TRIGGER guard_policy_actor BEFORE INSERT OR UPDATE ON source_collection_policies FOR EACH ROW EXECUTE FUNCTION guard_pending_actor_write();

INSERT INTO schema_migrations(name) VALUES('009_account_privacy.sql');
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

INSERT INTO schema_migrations(name) VALUES('010_research_job_actions.sql');
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

INSERT INTO schema_migrations(name) VALUES('011_source_http_validators.sql');
CREATE TABLE source_retry_after (
 source_id text PRIMARY KEY REFERENCES sources(id),
 retry_after_at timestamptz,
 requires_review boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT NOW(),
 CHECK(retry_after_at IS NOT NULL OR requires_review)
);

INSERT INTO schema_migrations(name) VALUES('012_source_retry_after.sql');
CREATE TABLE onboarding_progress (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  step smallint NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 3),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations(name) VALUES('013_onboarding_progress.sql');
ALTER TABLE notification_preferences
  ADD COLUMN deadline_reminders_enabled boolean NOT NULL DEFAULT false;

INSERT INTO schema_migrations(name) VALUES('014_deadline_reminder_preference.sql');
DO $guard$ DECLARE item record; BEGIN FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='smartmanuai' LOOP EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY','smartmanuai',item.tablename); END LOOP; FOR item IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='smartmanuai' LOOP EXECUTE format('ALTER FUNCTION %s SET search_path=smartmanuai,pg_catalog',item.signature); END LOOP; END $guard$;
REVOKE ALL ON SCHEMA "smartmanuai" FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA "smartmanuai" FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "smartmanuai" FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "smartmanuai" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT USAGE ON SCHEMA "smartmanuai" TO "smartmanuai_reader";
GRANT SELECT ON opportunities,sources,schema_migrations TO "smartmanuai_reader";
CREATE POLICY staging_public_opportunities ON opportunities FOR SELECT TO "smartmanuai_reader" USING(state IN ('published','closed'));
CREATE POLICY staging_public_sources ON sources FOR SELECT TO "smartmanuai_reader" USING(EXISTS(SELECT 1 FROM "smartmanuai".opportunities o WHERE o.source_id=sources.id AND o.state IN ('published','closed')));
CREATE POLICY staging_migration_status ON schema_migrations FOR SELECT TO "smartmanuai_reader" USING(true);
RESET ROLE;
