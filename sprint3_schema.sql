-- ============================================================================
-- ChronoGrid Storage-Datenmodell
-- Normative Grundlage: CG-STD-4100 v0.5 Kap. 3
-- 8 Tabellen: timepoints, components, domains, mappings, relations,
--             versions, segments (CGUAS), manifests (CGFS)
-- Alle Tabellen: Insert-only (keine UPDATE/DELETE auf Kerndaten)
-- BigInt-Werte: NUMERIC(30) — verlustfrei, kein Float
-- ============================================================================

-- Erweiterungen (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Tabelle: domains (Kap. 3.4)
-- Registry aller CTDDL-Domain-Definitionen.
-- Jede Version ist ein unveränderlicher Eintrag.
-- domain_id = "<name>/v<version>", z.B. "Gregorian/v2"
-- ============================================================================

CREATE TABLE domains (
  domain_id       VARCHAR(255)  NOT NULL,   -- "Gregorian/v2"
  domain_name     VARCHAR(128)  NOT NULL,
  domain_version  VARCHAR(20)   NOT NULL,
  semantics       VARCHAR(20)   NOT NULL DEFAULT 'time',  -- time|address|filetype
  ctddl_json      TEXT          NOT NULL,   -- vollständige CTDDL-Definition
  integrity_hash  CHAR(64)      NOT NULL,   -- SHA-256(ctddl_json)
  stability       VARCHAR(20)   NOT NULL,   -- high|medium|low
  published_at    CHAR(64)      NOT NULL,   -- TAI-CGTA
  published_by    VARCHAR(255)  NOT NULL,

  PRIMARY KEY (domain_id),

  -- I-D1: keine doppelte Registrierung derselben Version
  CONSTRAINT uq_domain_version UNIQUE (domain_name, domain_version),

  CONSTRAINT ck_semantics  CHECK (semantics IN ('time', 'address', 'filetype')),
  CONSTRAINT ck_stability  CHECK (stability IN ('high', 'medium', 'low'))
);

-- Index für Domain-Registry-Lookup
CREATE UNIQUE INDEX idx_dom_name ON domains (domain_name, domain_version);

-- ============================================================================
-- Tabelle: timepoints (Kap. 3.2)
-- Zentrale Tabelle. Jeder CGTA-Zeitpunkt mit MachineID.
-- machine_id = SHA-256(domain_id || absolute_value || granularity)
-- absolute_value: NUMERIC(30) — kein Float, BigInt-sicher (Cosmic-Domain: bis ~4×10²³)
-- ============================================================================

CREATE TABLE timepoints (
  machine_id      CHAR(64)       NOT NULL,   -- SHA-256, hex-encoded (32 Bytes)
  cgta_string     TEXT           NOT NULL,   -- vollständige CGTA "CG:<domain>:<val>/v<ver>"
  domain_id       VARCHAR(255)   NOT NULL,   -- FK → domains.domain_id
  absolute_value  NUMERIC(30)    NOT NULL,   -- Integer, Domain-Granularität (kein Float!)
  granularity     VARCHAR(30)    NOT NULL,   -- "nanosecond","second","millisecond",...
  sigma           NUMERIC(30),               -- Messunsicherheit in Nanosekunden (optional)
  created_at      CHAR(64)       NOT NULL,   -- TAI-CGTA des Einfügezeitpunkts
  created_by      VARCHAR(255)   NOT NULL,

  PRIMARY KEY (machine_id),

  CONSTRAINT fk_tp_domain FOREIGN KEY (domain_id)
    REFERENCES domains (domain_id),

  -- absolute_value darf kein Float sein (I-R3: Determinismus)
  CONSTRAINT ck_tp_absval CHECK (absolute_value = TRUNC(absolute_value))
);

-- Normative Indizes (Kap. 3.7)
CREATE INDEX idx_tp_domain  ON timepoints (domain_id);
CREATE INDEX idx_tp_absval  ON timepoints (domain_id, absolute_value);
CREATE INDEX idx_tp_created ON timepoints (created_at);

-- ============================================================================
-- Tabelle: components (Kap. 3.3)
-- Aufgelöste Zeitkomponenten (Jahr, Monat, Tag, ...) für effiziente Abfragen.
-- Wird automatisch befüllt wenn Domain eine hierarchy-Definition hat.
-- ============================================================================

CREATE TABLE components (
  machine_id       CHAR(64)      NOT NULL,
  component_type   VARCHAR(20)   NOT NULL,   -- "year","month","day","hour","minute","second"
  component_value  BIGINT        NOT NULL,   -- int64 reicht für Gregorianische Komponenten

  PRIMARY KEY (machine_id, component_type),

  CONSTRAINT fk_comp_tp FOREIGN KEY (machine_id)
    REFERENCES timepoints (machine_id),

  CONSTRAINT ck_comp_type CHECK (
    component_type IN ('year','month','day','hour','minute','second','millisecond','nanosecond','weekday')
  )
);

-- Normative Indizes (Kap. 3.7)
CREATE INDEX idx_comp_type ON components (machine_id, component_type, component_value);

-- ============================================================================
-- Tabelle: mappings (Kap. 3.5)
-- Versionnierte Mapping-Regeln zwischen Domain-Paaren.
-- mapping_id = "<source_domain>-><target_domain>", z.B. "Gregorian/v2->TAI/v1"
-- ============================================================================

CREATE TABLE mappings (
  mapping_id      VARCHAR(255)  NOT NULL,   -- "Gregorian/v2->TAI/v1"
  source_domain   VARCHAR(255)  NOT NULL,   -- FK → domains.domain_id
  target_domain   VARCHAR(255)  NOT NULL,   -- FK → domains.domain_id
  mapping_class   CHAR(1)       NOT NULL,   -- "A" oder "B"
  mapping_json    TEXT          NOT NULL,   -- Mapping-Regeln als JSON
  integrity_hash  CHAR(64)      NOT NULL,   -- SHA-256(mapping_json)
  published_at    CHAR(64)      NOT NULL,   -- TAI-CGTA

  PRIMARY KEY (mapping_id),

  CONSTRAINT fk_map_src FOREIGN KEY (source_domain) REFERENCES domains (domain_id),
  CONSTRAINT fk_map_tgt FOREIGN KEY (target_domain) REFERENCES domains (domain_id),
  CONSTRAINT ck_map_class CHECK (mapping_class IN ('A', 'B')),

  -- Max. Mapping-Kette implizit durch Anwendungslogik (CG-E-005.010: max 8)
  CONSTRAINT uq_map_pair UNIQUE (source_domain, target_domain)
);

-- ============================================================================
-- Tabelle: relations (Kap. 3.6)
-- Gespeicherte Allen-Relationen zwischen Zeitpunkt-Paaren/-Intervallen.
-- relation_id = SHA-256(machine_id_a || machine_id_b || relation_type)
-- ============================================================================

CREATE TABLE relations (
  relation_id    CHAR(64)      NOT NULL,   -- SHA-256 Eindeutigkeit
  machine_id_a   CHAR(64)      NOT NULL,
  machine_id_b   CHAR(64)      NOT NULL,
  relation_type  VARCHAR(20)   NOT NULL,   -- Allen-Relation (13 Werte + ChronoGrid-Ext.)
  computed_at    CHAR(64)      NOT NULL,   -- TAI-CGTA

  PRIMARY KEY (relation_id),

  CONSTRAINT fk_rel_a FOREIGN KEY (machine_id_a) REFERENCES timepoints (machine_id),
  CONSTRAINT fk_rel_b FOREIGN KEY (machine_id_b) REFERENCES timepoints (machine_id),

  CONSTRAINT ck_rel_type CHECK (relation_type IN (
    'before', 'after', 'meets', 'metBy',
    'overlaps', 'overlappedBy', 'starts', 'startedBy',
    'during', 'contains', 'finishes', 'finishedBy', 'equals'
  ))
);

-- Normative Indizes (Kap. 3.7)
CREATE INDEX idx_rel_pair ON relations (machine_id_a, machine_id_b);

-- ============================================================================
-- Tabelle: versions (Audit-Log)
-- Unveränderliches Audit-Log aller Domain-Versionsänderungen.
-- ============================================================================

CREATE TABLE versions (
  version_id   CHAR(64)      NOT NULL,   -- SHA-256(domain_id || version || action || at)
  domain_id    VARCHAR(255)  NOT NULL,
  version_num  VARCHAR(20)   NOT NULL,
  action       VARCHAR(20)   NOT NULL,   -- "published","deprecated","superseded"
  performed_at CHAR(64)      NOT NULL,   -- TAI-CGTA
  performed_by VARCHAR(255)  NOT NULL,
  notes        TEXT,

  PRIMARY KEY (version_id),

  CONSTRAINT fk_ver_domain FOREIGN KEY (domain_id) REFERENCES domains (domain_id),
  CONSTRAINT ck_ver_action CHECK (action IN ('published', 'deprecated', 'superseded'))
);

-- ============================================================================
-- Tabelle: segments (CGUAS, NEU v0.3, Kap. 3.8)
-- Alle zugeteilten CGUAS-Adresssegmente.
-- Insert-only: kein hartes Löschen, nur status='inactive'
-- NUMERIC(30) für BigInt (79-Bit-Adressraum)
-- ============================================================================

CREATE TABLE segments (
  segment_id      VARCHAR(255)  NOT NULL,   -- z.B. "at.gv.staatsarchiv"
  owner_id        VARCHAR(255)  NOT NULL,   -- vollständiger Identifier
  parent_id       VARCHAR(255),             -- NULL = Root-Segment
  start_address   NUMERIC(30)   NOT NULL,   -- CGUA-Startadresse (inklusiv, BigInt)
  end_address     NUMERIC(30)   NOT NULL,   -- CGUA-Endadresse (exklusiv, BigInt)
  size_ns         NUMERIC(30)   NOT NULL,   -- = end_address - start_address
  granted_at      CHAR(64)      NOT NULL,   -- TAI-CGTA des Zuteilungszeitpunkts
  granted_by      VARCHAR(255)  NOT NULL,   -- Registrierungsstelle
  integrity_hash  CHAR(64)      NOT NULL,   -- SHA-256(owner||start||end||granted_at)
  level           INTEGER       NOT NULL,   -- Hierarchieebene (0=Root, 1–6)
  status          VARCHAR(20)   NOT NULL DEFAULT 'active',
  resolver_config TEXT,                     -- JSON: physischer Resolver (NEU v0.4)

  PRIMARY KEY (segment_id),

  -- Selbstreferenz für Hierarchie
  CONSTRAINT fk_seg_parent FOREIGN KEY (parent_id) REFERENCES segments (segment_id),

  -- Keine Überlappungen: (parent_id, start_address) ist eindeutig
  CONSTRAINT uq_seg_range UNIQUE (parent_id, start_address),

  -- Konsistenz-Constraints
  CONSTRAINT ck_seg_range CHECK (end_address > start_address),
  CONSTRAINT ck_seg_size  CHECK (size_ns = end_address - start_address),
  CONSTRAINT ck_seg_level CHECK (level >= 0 AND level <= 6),
  CONSTRAINT ck_seg_status CHECK (status IN ('active', 'inactive'))
);

-- Normative Indizes (Kap. 3.8)
CREATE UNIQUE INDEX idx_seg_range ON segments (parent_id, start_address);
CREATE INDEX        idx_seg_owner ON segments (owner_id);
CREATE INDEX        idx_seg_level ON segments (level, status);
-- Bereichsabfragen für CGUA-Auflösung (CG-STD-6100 Kap. 3.4)
CREATE INDEX        idx_seg_addr  ON segments (start_address, end_address) WHERE status = 'active';

-- ============================================================================
-- Tabelle: manifests (CGFS, NEU v0.3, Kap. 3.10)
-- CGFS-Manifest-Metadaten. Dateiinhalt extern (Blob-Storage).
-- Insert-only: deleted_at statt DELETE (DSGVO-konformes logisches Löschen)
-- ============================================================================

CREATE TABLE manifests (
  cgfi            CHAR(64)      NOT NULL,   -- SHA-256 (CG-STD-3100 Kap. 5.4)
  cgfs_version    VARCHAR(10)   NOT NULL,   -- CGFS-Spezifikationsversion
  type_id         VARCHAR(255)  NOT NULL,   -- z.B. "legal/contract/v1"
  type_schema     TEXT          NOT NULL,   -- URL zur Typ-Definition
  created_at      CHAR(64)      NOT NULL,   -- TAI-CGTA des Erstellungszeitpunkts
  content_hash    CHAR(64)      NOT NULL,   -- SHA-256 des Dateiinhalts (Integrität)
  size_bytes      BIGINT,                   -- Dateigröße in Bytes
  prev_version    CHAR(64),                 -- CGFI der Vorversion (NULL = erste Version)
  cgua            VARCHAR(255),             -- CGUA-Adresse (optional)
  valid_from      CHAR(64),                 -- CGTA (optional)
  valid_until     CHAR(64),                 -- CGTA (optional)
  retention       VARCHAR(20),              -- ISO-8601-Dauer, z.B. "P30Y"
  review_after    VARCHAR(20),              -- ISO-8601-Dauer, z.B. "P2Y"
  language        VARCHAR(10),              -- BCP-47, z.B. "de-AT"
  created_by      VARCHAR(255)  NOT NULL,
  tags            TEXT,                     -- JSON-Array von Tags
  access_level    VARCHAR(20)   NOT NULL DEFAULT 'restricted',

  -- Logisches Löschen (DSGVO Art. 17) — kein hartes DELETE
  deleted_at      CHAR(64),                 -- TAI-CGTA bei logischem Löschen
  deleted_reason  VARCHAR(50),              -- "dsgvo_art17","retention_expired",...

  PRIMARY KEY (cgfi),

  -- Versions-Chain: Vorgänger-Manifest muss existieren
  CONSTRAINT fk_man_prev FOREIGN KEY (prev_version)
    REFERENCES manifests (cgfi),

  -- FileType muss registrierte CTDDL-Domain sein (semantics: "filetype")
  CONSTRAINT fk_man_type FOREIGN KEY (type_id)
    REFERENCES domains (domain_id),

  -- CGUA-Adresse muss in registriertem Segment liegen (wenn gesetzt)
  -- (in PostgreSQL: via Trigger, nicht FK, da CGUA VARCHAR vs. NUMERIC)

  CONSTRAINT ck_man_access CHECK (access_level IN ('public', 'restricted', 'confidential', 'secret')),
  CONSTRAINT ck_man_del_reason CHECK (
    deleted_reason IS NULL OR
    deleted_reason IN ('dsgvo_art17', 'retention_expired', 'legal_hold', 'admin')
  )
);

-- Indizes für Manifest-Lookups
CREATE INDEX idx_man_type    ON manifests (type_id);
CREATE INDEX idx_man_created ON manifests (created_at);
CREATE INDEX idx_man_cgua    ON manifests (cgua) WHERE cgua IS NOT NULL;
CREATE INDEX idx_man_prev    ON manifests (prev_version) WHERE prev_version IS NOT NULL;
-- Logisches Löschen: aktive Manifeste
CREATE INDEX idx_man_active  ON manifests (created_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- View: active_manifests
-- Normative Hilfssicht auf nicht-gelöschte Manifeste.
-- ============================================================================

CREATE VIEW active_manifests AS
  SELECT * FROM manifests WHERE deleted_at IS NULL;

-- ============================================================================
-- View: domain_registry
-- Aktuelle Domain-Registrierungen mit neuester Version.
-- ============================================================================

CREATE VIEW domain_registry AS
  SELECT DISTINCT ON (domain_name)
    domain_id, domain_name, domain_version, semantics, stability, published_at
  FROM domains
  ORDER BY domain_name, domain_version DESC;

-- ============================================================================
-- Trigger: Insert-only Enforcement
-- Verhindert UPDATE/DELETE auf Kerntabellen (I-D1, Kap. 2.1)
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_insert_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CG-E-006.004: I-D1 verletzt — % ist Insert-only. Keine UPDATE/DELETE erlaubt.', TG_TABLE_NAME;
END;
$$;

-- Anwenden auf alle normativen Kerntabellen
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['timepoints','components','domains','mappings','relations','versions']
  LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%s_insert_only
      BEFORE UPDATE OR DELETE ON %s
      FOR EACH ROW EXECUTE FUNCTION enforce_insert_only();
    ', t, t);
  END LOOP;
END;
$$;

-- segments: UPDATE nur für status (inactive), niemals DELETE
CREATE OR REPLACE FUNCTION enforce_segments_insert_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CG-E-006.004: I-D1 verletzt — segments ist Insert-only. Verwende status=inactive.';
  END IF;
  -- UPDATE: nur status-Feld darf geändert werden
  IF TG_OP = 'UPDATE' THEN
    IF OLD.segment_id    != NEW.segment_id    OR
       OLD.start_address != NEW.start_address OR
       OLD.end_address   != NEW.end_address   OR
       OLD.owner_id      != NEW.owner_id      THEN
      RAISE EXCEPTION 'CG-E-006.004: I-D1 verletzt — Kerndaten von segments sind unveränderlich.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_segments_insert_only
BEFORE UPDATE OR DELETE ON segments
FOR EACH ROW EXECUTE FUNCTION enforce_segments_insert_only();

-- manifests: UPDATE nur für deleted_at/deleted_reason, niemals DELETE
CREATE OR REPLACE FUNCTION enforce_manifests_insert_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CG-E-006.004: I-D1 verletzt — manifests ist Insert-only. Verwende logisches Löschen (deleted_at).';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.cgfi != NEW.cgfi OR OLD.content_hash != NEW.content_hash OR OLD.created_at != NEW.created_at THEN
      RAISE EXCEPTION 'CG-E-006.004: I-D1 verletzt — Kerndaten von manifests sind unveränderlich.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manifests_insert_only
BEFORE UPDATE OR DELETE ON manifests
FOR EACH ROW EXECUTE FUNCTION enforce_manifests_insert_only();
