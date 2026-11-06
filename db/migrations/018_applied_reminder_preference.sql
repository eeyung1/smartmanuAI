ALTER TABLE notification_preferences
  ADD COLUMN applied_reminders_enabled boolean NOT NULL DEFAULT false;
