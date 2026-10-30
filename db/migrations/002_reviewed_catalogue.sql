CREATE TABLE admin_roles (user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE);
CREATE TABLE sources (id text PRIMARY KEY, name text NOT NULL, url text NOT NULL UNIQUE, synthetic boolean NOT NULL DEFAULT false, created_by text NOT NULL REFERENCES auth_user(id), created_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE opportunities (id text PRIMARY KEY, source_id text NOT NULL REFERENCES sources(id), revision integer NOT NULL CHECK(revision>0), state text NOT NULL CHECK(state IN ('draft','published','closed','rejected')), details jsonb NOT NULL, evidence jsonb NOT NULL, verified_at timestamptz, updated_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE opportunity_revisions (opportunity_id text NOT NULL REFERENCES opportunities(id), revision integer NOT NULL, state text NOT NULL, details jsonb NOT NULL, evidence jsonb NOT NULL, actor_id text NOT NULL REFERENCES auth_user(id), note text NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW(), PRIMARY KEY(opportunity_id,revision));
CREATE INDEX opportunities_public ON opportunities(state,verified_at DESC,id);
CREATE INDEX saved_items_opportunity ON saved_items(opportunity_id);
