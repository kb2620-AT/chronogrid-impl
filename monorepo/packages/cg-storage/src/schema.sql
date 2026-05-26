-- ChronoGrid PostgreSQL Schema
-- Abgeleitet aus cg-storage/src/pg-repository.ts
-- Normative Grundlage: CG-STD-4100 v1.1 Kap. 3 (Insert-only, NUMERIC für BigInt)
-- Verwendet in: GitHub Actions black-box-api Job (Sprint 11-A)

-- Zeitpunkte (CG-STD-4100 Kap. 3.2)
CREATE TABLE IF NOT EXISTS timepoints (
  machine_id     TEXT        PRIMARY KEY,
  domain_name    TEXT        NOT NULL,
  domain_version TEXT        NOT NULL,
  absolute_value NUMERIC     NOT NULL,
  cgta           TEXT        NOT NULL,
  labels         JSONB       NOT NULL DEFAULT '{}',
  created_at     NUMERIC     NOT NULL
);

-- Domain-Definitionen (CG-STD-4100 Kap. 3.3)
CREATE TABLE IF NOT EXISTS domains (
  name           TEXT        NOT NULL,
  version        TEXT        NOT NULL,
  definition     JSONB       NOT NULL,
  published      BOOLEAN     NOT NULL DEFAULT FALSE,
  published_at   NUMERIC,
  created_at     NUMERIC     NOT NULL,
  UNIQUE (name, version)
);

-- CGFS-Manifeste (CG-STD-4100 Kap. 3.10, CG-STD-6100 Kap. 7)
CREATE TABLE IF NOT EXISTS manifests (
  cgfi           TEXT        PRIMARY KEY,
  tai_timepoint  TEXT        NOT NULL,
  content_hash   TEXT        NOT NULL,
  type_id        TEXT        NOT NULL,
  size_bytes     NUMERIC     NOT NULL,
  metadata       JSONB       NOT NULL DEFAULT '{}',
  tombstone      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     NUMERIC     NOT NULL
);

-- Allen-Relationen (CG-STD-4100 Kap. 3.5)
CREATE TABLE IF NOT EXISTS relations (
  id             TEXT        PRIMARY KEY,
  timepoint_a    TEXT        NOT NULL,
  timepoint_b    TEXT        NOT NULL,
  relation       TEXT        NOT NULL,
  computed_at    NUMERIC     NOT NULL
);

-- CGUAS-Segmente (CG-STD-4100 Kap. 3.8, CG-STD-6100 Kap. 3)
CREATE TABLE IF NOT EXISTS segments (
  id             TEXT        PRIMARY KEY,
  parent_id      TEXT,
  base_address   NUMERIC     NOT NULL,
  size_ns        NUMERIC     NOT NULL,
  granted_by     TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'active',
  created_at     NUMERIC     NOT NULL
);
