-- ChronoGrid PostgreSQL Schema
-- Abgeleitet aus cg-storage/src/pg-repository.ts
-- Normative Grundlage: CG-STD-4100 v1.1 Kap. 3 (Insert-only, NUMERIC für BigInt)
-- Verwendet in: GitHub Actions black-box-api Job (Sprint 11-A)
-- FIX-11 (Entscheidung 3): echtes Insert-only. Statuswechsel (publish/tombstone/revoke)
--   werden als append-only Ereignisse in lifecycle_events geschrieben; UPDATE/DELETE auf allen
--   normativen Tabellen wird durch Trigger strukturell verhindert (I-S1, I-D1).
-- WICHTIG: schema.sql und die umgeschriebenen Repository-Methoden müssen GEMEINSAM deployt werden
--   (die alten UPDATE-basierten publish/tombstone/revoke würden sonst am Trigger scheitern).

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
-- published/published_at bleiben als INITIALwert beim Insert; der publizierte Zustand
-- wird aus lifecycle_events abgeleitet (siehe View v_domains).
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

-- ── FIX-11: append-only Lebenszyklus-Ereignisse ─────────────────────────────
-- Jeder Statuswechsel ist ein INSERT. Der aktuelle Zustand wird abgeleitet (Views unten).
CREATE TABLE IF NOT EXISTS lifecycle_events (
  seq          BIGSERIAL   PRIMARY KEY,
  entity_type  TEXT        NOT NULL CHECK (entity_type IN ('domain','manifest','segment')),
  entity_id    TEXT        NOT NULL,   -- domain: 'name@version' · manifest: cgfi · segment: id
  event        TEXT        NOT NULL CHECK (event IN ('published','tombstoned','revoked')),
  payload      JSONB       NOT NULL DEFAULT '{}',
  created_at   NUMERIC     NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_entity ON lifecycle_events (entity_type, entity_id, event);

-- Abgeleiteter Zustand (optional für Lesepfad/Diagnose; die Repository-Reads nutzen EXISTS-Joins).
CREATE OR REPLACE VIEW v_domains AS
  SELECT d.*, (d.published OR EXISTS (
    SELECT 1 FROM lifecycle_events e
    WHERE e.entity_type='domain' AND e.entity_id = d.name||'@'||d.version AND e.event='published'
  )) AS is_published
  FROM domains d;

CREATE OR REPLACE VIEW v_manifests AS
  SELECT m.*, (m.tombstone OR EXISTS (
    SELECT 1 FROM lifecycle_events e
    WHERE e.entity_type='manifest' AND e.entity_id = m.cgfi AND e.event='tombstoned'
  )) AS is_tombstoned
  FROM manifests m;

CREATE OR REPLACE VIEW v_segments AS
  SELECT s.*, (CASE WHEN EXISTS (
    SELECT 1 FROM lifecycle_events e
    WHERE e.entity_type='segment' AND e.entity_id = s.id AND e.event='revoked'
  ) THEN 'revoked' ELSE s.status END) AS effective_status
  FROM segments s;

-- ── FIX-11: strukturelle Immutabilität (I-S1 / I-D1) ─────────────────────────
-- Blockiert UPDATE und DELETE auf allen normativen Tabellen inkl. lifecycle_events.
-- INSERT bleibt erlaubt (Trigger feuert nur bei UPDATE/DELETE).
CREATE OR REPLACE FUNCTION cg_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CG-E-006 InvariantError: % auf insert-only-Tabelle "%" verletzt I-S1/I-D1 (CG-STD-4100 Kap. 3)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['timepoints','domains','manifests','relations','segments','lifecycle_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_immutable ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_immutable BEFORE UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION cg_block_mutation()', t);
  END LOOP;
END;
$$;
