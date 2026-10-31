ALTER TABLE profiles ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE saved_items ADD COLUMN saved boolean NOT NULL DEFAULT true;
ALTER TABLE saved_items ADD COLUMN dismissed_fingerprint text;
ALTER TABLE saved_items ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE saved_items ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW();
CREATE INDEX saved_items_user_updated ON saved_items(user_id,updated_at DESC);
UPDATE profiles SET preferences=jsonb_set(preferences,'{nationality}',CASE WHEN upper(preferences->>'nationality') ~ '^[A-Z]{2}$' THEN to_jsonb(upper(preferences->>'nationality')) ELSE 'null'::jsonb END) WHERE preferences ? 'nationality';
