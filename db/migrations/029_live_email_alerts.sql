CREATE TABLE live_email_provider (
 id integer PRIMARY KEY CHECK(id=1),
 webhook_id bigint NOT NULL,
 configuration_hash text NOT NULL,
 registered_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE live_email_deliveries (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('digest','test')),
 slot text NOT NULL,
 preference_version integer NOT NULL,
 consent_epoch integer NOT NULL,
 recipient_hash text NOT NULL,
 items jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','dispatching','accepted','failed','uncertain','suppressed')),
 provider_state text,
 message_id text UNIQUE,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT NOW(),
 started_at timestamptz,
 completed_at timestamptz,
 UNIQUE(user_id,slot,preference_version)
);
CREATE INDEX live_email_owner_history ON live_email_deliveries(user_id,created_at DESC,id);
CREATE INDEX live_email_pending ON live_email_deliveries(created_at,id) WHERE state='pending';
CREATE TABLE live_email_seen (
 user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 event_key text NOT NULL,
 delivery_id text NOT NULL REFERENCES live_email_deliveries(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,event_key)
);
CREATE INDEX live_email_seen_delivery ON live_email_seen(delivery_id);
CREATE TABLE live_email_quota (
 bucket text NOT NULL,
 day date NOT NULL,
 attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 10),
 PRIMARY KEY(bucket,day)
);
CREATE TABLE live_email_events (
 event_key text PRIMARY KEY,
 delivery_id text NOT NULL REFERENCES live_email_deliveries(id) ON DELETE CASCADE,
 message_id text NOT NULL,
 event_type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX live_email_events_delivery ON live_email_events(delivery_id);
CREATE TRIGGER guard_live_email_account BEFORE INSERT OR UPDATE ON live_email_deliveries
FOR EACH ROW EXECUTE FUNCTION guard_pending_account_write();
