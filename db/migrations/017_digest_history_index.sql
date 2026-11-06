CREATE INDEX notification_digest_history_owner
  ON notification_digests(user_id, created_at DESC, id);
