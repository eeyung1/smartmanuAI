ALTER TABLE notification_preferences ADD COLUMN email_consent_epoch integer NOT NULL DEFAULT 0;
CREATE TABLE notification_unsubscribe_tokens (nonce_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,consent_epoch integer NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE email_digest_attempts (message_id text PRIMARY KEY,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,recipient_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE email_webhook_events (event_id text PRIMARY KEY,message_id text NOT NULL,event_type text NOT NULL,recipient_hashes jsonb NOT NULL,applied boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT NOW());
CREATE INDEX email_event_message ON email_webhook_events(message_id);
CREATE TABLE email_suppressions (recipient_hash text PRIMARY KEY,reason text NOT NULL CHECK(reason IN ('bounce','complaint')),event_id text NOT NULL REFERENCES email_webhook_events(event_id),created_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE email_control_lock (id integer PRIMARY KEY CHECK(id=1));
INSERT INTO email_control_lock(id) VALUES(1);
