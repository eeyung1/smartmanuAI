ALTER TABLE notification_preferences
  ADD COLUMN deadline_reminders_enabled boolean NOT NULL DEFAULT false;
