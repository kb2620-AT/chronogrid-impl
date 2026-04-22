-- ChronoGrid PostgreSQL Schema
-- CG-STD-4100 v0.7 Kap. 3.7 | Insert-only (I-D1, I-S1)
-- BigInt: NUMERIC(30) für ℤ∞

CREATE TABLE IF NOT EXISTS timepoints (
  machine_id     TEXT        PRIMARY KEY,
  domain_name    TEXT        NOT NULL,
  domain_version TEXT        NOT NULL,
  absolute_value NUMERIC(30) NOT NULL,
  cgta           TEXT        NOT NULL,
  labels         JSONB       NOT NULL DEFAULT '{}',
  created_at     NUMERIC(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
  name         TEXT    NOT NULL,
  version      TEXT    NOT NULL,
  definition   JSONB   NOT NULL,
  published    BOOLEAN NOT NULL DEFAULT false,
  published_at NUMERIC(30),
  created_at   NUMERIC(30) NOT NULL,
  PRIMARY KEY (name, version)
);

CREATE TABLE IF NOT EXISTS manifests (
  cgfi           TEXT        PRIMARY KEY,
  tai_timepoint  TEXT        NOT NULL REFERENCES timepoints(machine_id),
  content_hash   TEXT        NOT NULL,
  type_id        TEXT        NOT NULL,
  size_bytes     NUMERIC(30) NOT NULL,
  metadata       JSONB       NOT NULL DEFAULT '{}',
  tombstone      BOOLEAN     NOT NULL DEFAULT false,
  created_at     NUMERIC(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS relations (
  id           TEXT        PRIMARY KEY,
  timepoint_a  TEXT        NOT NULL REFERENCES timepoints(machine_id),
  timepoint_b  TEXT        NOT NULL REFERENCES timepoints(machine_id),
  relation     TEXT        NOT NULL,
  computed_at  NUMERIC(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id           TEXT        PRIMARY KEY,
  parent_id    TEXT,
  base_address NUMERIC(30) NOT NULL,
  size_ns      NUMERIC(30) NOT NULL,
  granted_by   TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','revoked')),
  created_at   NUMERIC(30) NOT NULL
);

-- Sprint 7: Webhooks (CG-STD-4100 Kap. 6)
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id          TEXT        PRIMARY KEY,
  url         TEXT        NOT NULL,
  events      TEXT[]      NOT NULL,
  secret      TEXT        NOT NULL,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  NUMERIC(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              TEXT        PRIMARY KEY,
  subscription_id TEXT        NOT NULL REFERENCES webhook_subscriptions(id),
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts        INTEGER     NOT NULL DEFAULT 0,
  delivered_at    NUMERIC(30),
  created_at      NUMERIC(30) NOT NULL
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_timepoints_domain    ON timepoints(domain_name, domain_version);
CREATE INDEX IF NOT EXISTS idx_timepoints_created   ON timepoints(created_at);
CREATE INDEX IF NOT EXISTS idx_manifests_tombstone  ON manifests(tombstone) WHERE tombstone = false;
CREATE INDEX IF NOT EXISTS idx_segments_status      ON segments(status);
CREATE INDEX IF NOT EXISTS idx_webhook_del_sub      ON webhook_deliveries(subscription_id, status);
