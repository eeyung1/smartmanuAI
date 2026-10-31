CREATE TABLE telegram_link_tokens (token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,issued_at timestamptz NOT NULL DEFAULT NOW(),expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE INDEX telegram_link_token_user ON telegram_link_tokens(user_id,issued_at DESC);
CREATE TABLE telegram_bindings (user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,state text NOT NULL CHECK(state IN ('pending','active','revoked')),version integer NOT NULL DEFAULT 1,chat_hash text NOT NULL,encrypted_chat text NOT NULL,chat_suffix text NOT NULL,event_date bigint NOT NULL,update_id bigint NOT NULL,updated_at timestamptz NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX telegram_chat_owner ON telegram_bindings(chat_hash) WHERE state IN ('pending','active');
CREATE TABLE telegram_webhook_updates (update_id bigint PRIMARY KEY,processed_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE telegram_chat_events (chat_hash text PRIMARY KEY,event_date bigint NOT NULL,update_id bigint NOT NULL,blocked boolean NOT NULL);
CREATE TABLE telegram_connection_lock (id integer PRIMARY KEY CHECK(id=1));
INSERT INTO telegram_connection_lock(id) VALUES(1);
