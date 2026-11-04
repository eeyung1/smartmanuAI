CREATE TABLE onboarding_progress (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  step smallint NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 3),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
