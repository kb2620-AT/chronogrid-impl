/**
 * cg-types/src/errors.ts
 * Normative error code catalog — CG-STD-2100 v1.4, Kap. 9
 * 11 Klassen, 64 normative Sub-Codes
 */
export class CGError extends Error {
    code;
    class;
    severity;
    thrownBy;
    context;
    cgStd;
    constructor(fields) {
        super(fields.message);
        this.name = fields.class;
        this.code = fields.code;
        this.class = fields.class;
        this.severity = fields.severity;
        this.thrownBy = fields.thrownBy;
        this.context = fields.context;
        this.cgStd = fields.cgStd;
    }
    toJSON() {
        return {
            code: this.code,
            class: this.class,
            severity: this.severity,
            thrownBy: this.thrownBy,
            message: this.message,
            context: this.context,
            cgStd: this.cgStd,
        };
    }
}
// ── Hilfsfunktion ────────────────────────────────────────────────────────────
function cge(code, cls, severity, thrownBy, message, context) {
    return new CGError({ code, class: cls, severity, thrownBy, message, context,
        cgStd: 'CG-STD-2100-2026 v1.4' });
}
// ── CG-E-001 SyntaxError (7 Sub-Codes) ──────────────────────────────────────
export const Errors = {
    SyntaxError: {
        InvalidJSON: (ctx) => cge('CG-E-001.001', 'SyntaxError', 'FATAL', 'Parser', 'Ungültiges JSON-Format', ctx),
        MissingField: (field) => cge('CG-E-001.002', 'SyntaxError', 'FATAL', 'Parser', `Pflichtfeld fehlt: ${field}`, { field }),
        InvalidFieldType: (field, expected, got) => cge('CG-E-001.003', 'SyntaxError', 'FATAL', 'Parser', `Ungültiger Feldtyp: ${field}`, { field, expected, got }),
        InvalidDomainType: (value) => cge('CG-E-001.004', 'SyntaxError', 'FATAL', 'Parser', `Ungültiger Domain-Typ: ${value}`, { value }),
        InvalidGranularity: (value) => cge('CG-E-001.005', 'SyntaxError', 'FATAL', 'Parser', `Ungültige Granularität: ${value}`, { value }),
        InvalidVersion: (value) => cge('CG-E-001.006', 'SyntaxError', 'FATAL', 'Parser', `Ungültiges Versionsformat: ${value}`, { value }),
        ABNFViolation: (ctx) => cge('CG-E-001.007', 'SyntaxError', 'FATAL', 'Parser', 'ABNF-Grammatik verletzt', ctx),
    },
    // ── CG-E-002 SemanticError (5 Sub-Codes) ──────────────────────────────────
    SemanticError: {
        DomainNameNotUnique: (name) => cge('CG-E-002.001', 'SemanticError', 'FATAL', 'Parser', `Domain-Name nicht eindeutig: ${name}`, { name }),
        CircularHierarchy: (ctx) => cge('CG-E-002.002', 'SemanticError', 'FATAL', 'Parser', 'Zirkuläre Hierarchie', ctx),
        InvalidGranularityCascade: (ctx) => cge('CG-E-002.003', 'SemanticError', 'FATAL', 'Parser', 'Ungültige Granularitäts-Kaskade', ctx),
        ConflictingInvariants: (ctx) => cge('CG-E-002.004', 'SemanticError', 'FATAL', 'Parser', 'Widersprüchliche Invarianten', ctx),
        InvalidRegex: (pattern) => cge('CG-E-002.005', 'SemanticError', 'FATAL', 'Parser', `Ungültige Regex: ${pattern}`, { pattern }),
    },
    // ── CG-E-003 ExtentError (5 Sub-Codes) ────────────────────────────────────
    ExtentError: {
        UnderLowerBound: (t, min) => cge('CG-E-003.001', 'ExtentError', 'FATAL', 'Engine', 'Zeitwert unter Untergrenze', { t: t.toString(), min: min.toString() }),
        OverUpperBound: (t, max) => cge('CG-E-003.002', 'ExtentError', 'FATAL', 'Engine', 'Zeitwert über Obergrenze', { t: t.toString(), max: max.toString() }),
        MinGreaterThanMax: (min, max) => cge('CG-E-003.003', 'ExtentError', 'FATAL', 'Engine', 'Extent min > max', { min: min.toString(), max: max.toString() }),
        Int64Overflow: (value) => cge('CG-E-003.004', 'ExtentError', 'FATAL', 'Engine', 'int64-Overflow (Level 1/2)', { value: value.toString() }),
        InvalidExtentUnit: (ctx) => cge('CG-E-003.005', 'ExtentError', 'FATAL', 'Engine', 'Ungültige Extent-Einheit', ctx),
    },
    // ── CG-E-004 HierarchyError (5 Sub-Codes) ─────────────────────────────────
    HierarchyError: {
        UnknownUnit: (unit) => cge('CG-E-004.001', 'HierarchyError', 'FATAL', 'Engine', `Unbekannte Zeiteinheit: ${unit}`, { unit }),
        MissingConversionFactor: (from, to) => cge('CG-E-004.002', 'HierarchyError', 'FATAL', 'Engine', 'Fehlender Konversionsfaktor', { from, to }),
        VariableFactorWithoutRule: (ctx) => cge('CG-E-004.003', 'HierarchyError', 'FATAL', 'Engine', 'Variabler Faktor ohne Regel', ctx),
        HierarchyIncomplete: (ctx) => cge('CG-E-004.004', 'HierarchyError', 'FATAL', 'Engine', 'Hierarchie nicht vollständig', ctx),
        InconsistentBaseSeconds: (ctx) => cge('CG-E-004.005', 'HierarchyError', 'FATAL', 'Engine', 'Inkonsistente baseSeconds', ctx),
    },
    // ── CG-E-005 MappingError (10 Sub-Codes) ──────────────────────────────────
    MappingError: {
        TargetDomainNotFound: (domain) => cge('CG-E-005.001', 'MappingError', 'FATAL', 'Engine', `Ziel-Domain nicht gefunden: ${domain}`, { domain }),
        MissingRefPoint: (ctx) => cge('CG-E-005.002', 'MappingError', 'FATAL', 'Engine', 'Fehlender Referenzpunkt', ctx),
        RefPointOutOfExtent: (ctx) => cge('CG-E-005.003', 'MappingError', 'FATAL', 'Engine', 'Referenzpunkt außerhalb Extent', ctx),
        OverlappingIntervals: (ctx) => cge('CG-E-005.004', 'MappingError', 'FATAL', 'Engine', 'Überlappende piecewise-Intervalle', ctx),
        PartitionGap: (ctx) => cge('CG-E-005.005', 'MappingError', 'FATAL', 'Engine', 'Lücke in piecewise-Partition', ctx),
        InvalidMathExpr: (expr) => cge('CG-E-005.006', 'MappingError', 'FATAL', 'Engine', `Ungültige math-expr Syntax: ${expr}`, { expr }),
        DivisionByZero: (ctx) => cge('CG-E-005.007', 'MappingError', 'FATAL', 'Engine', 'Division durch Null', ctx),
        ExternalReferenceInExpr: (ctx) => cge('CG-E-005.008', 'MappingError', 'FATAL', 'Engine', 'Externe Referenz in math-expr', ctx),
        RefPointConsistency: (ctx) => cge('CG-E-005.009', 'MappingError', 'FATAL', 'Engine', 'Referenzpunkt-Konsistenz verletzt (I-M3)', ctx),
        ChainTooLong: (length) => cge('CG-E-005.010', 'MappingError', 'FATAL', 'Engine', `Mapping-Kette zu lang: ${length} > 8`, { length }),
    },
    // ── CG-E-006 InvariantError (6 Sub-Codes) ─────────────────────────────────
    InvariantError: {
        I_R1: (ctx) => cge('CG-E-006.001', 'InvariantError', 'FATAL', 'Engine', 'I-R1 verletzt: kein eindeutiger Zeitwert', ctx),
        I_R2: (ctx) => cge('CG-E-006.002', 'InvariantError', 'FATAL', 'Engine', 'I-R2 verletzt: Totale Ordnung nicht gewährleistet', ctx),
        I_R3: (ctx) => cge('CG-E-006.003', 'InvariantError', 'FATAL', 'Engine', 'I-R3 verletzt: Deterministisches Ergebnis nicht reproduzierbar', ctx),
        I_D1: (ctx) => cge('CG-E-006.004', 'InvariantError', 'FATAL', 'Engine', 'I-D1 verletzt: Veröffentlichte Domain-Version modifiziert', ctx),
        I_M1: (ctx) => cge('CG-E-006.005', 'InvariantError', 'FATAL', 'Engine', 'I-M1 verletzt: Mapping nicht eindeutig', ctx),
        I_E1: (ctx) => cge('CG-E-006.006', 'InvariantError', 'FATAL', 'Engine', 'I-E1 verletzt: Universeller Zeitursprung deklariert (verboten)', ctx),
    },
    // ── CG-E-007 VersionError (4 Sub-Codes) ───────────────────────────────────
    VersionError: {
        NotFound: (domain, version) => cge('CG-E-007.001', 'VersionError', 'FATAL', 'Registry', `Version nicht gefunden: ${domain} v${version}`, { domain, version }),
        Incompatible: (a, b) => cge('CG-E-007.002', 'VersionError', 'FATAL', 'Engine', 'Inkompatible Versionen kombiniert', { a, b }),
        Outdated: (domain, current, latest) => cge('CG-E-007.003', 'VersionError', 'WARNING', 'Registry', `Veraltete Version: ${domain} v${current}, neu: v${latest}`, { domain, current, latest }),
        RollbackAttempt: (domain) => cge('CG-E-007.004', 'VersionError', 'FATAL', 'Registry', `Version-Rollback versucht: ${domain}`, { domain }),
    },
    // ── CG-E-008 ConstraintError (3 Sub-Codes, NEU v1.1) ──────────────────────
    ConstraintError: {
        MissingScientificDependency: (stability) => cge('CG-E-008.001', 'ConstraintError', 'FATAL', 'Validator', `scientific_dependency fehlt (stability=${stability})`, { stability }),
        UncertaintyExceeded: (actual, limit) => cge('CG-E-008.002', 'ConstraintError', 'WARNING', 'Engine', 'Unsicherheit überschritten', { actual, limit }),
        MappingConstraintViolated: (ctx) => cge('CG-E-008.003', 'ConstraintError', 'FATAL', 'Engine', 'Mapping-Constraint verletzt', ctx),
    },
    // ── CG-E-009 RegistryError (4 Sub-Codes, NEU v1.3) ────────────────────────
    RegistryError: {
        Conflict: (id) => cge('CG-E-009.001', 'RegistryError', 'ERROR', 'Registry', `Domain-ID oder FileType-ID bereits registriert: ${id}`, { id }),
        InvalidNamespace: (id) => cge('CG-E-009.002', 'RegistryError', 'ERROR', 'Registry', `filetype-id verletzt ABNF: ${id}`, { id }),
        FederationSyncFailed: (ctx) => cge('CG-E-009.003', 'RegistryError', 'WARNING', 'Registry', 'Registry-Föderation konnte nicht synchronisiert werden', ctx),
        UnauthorizedCategory: (category) => cge('CG-E-009.004', 'RegistryError', 'FATAL', 'Registry', `Neue Kategorie ohne CIP-D-Genehmigung: ${category}`, { category }),
    },
    // ── CG-E-010 CGUASError (8 Sub-Codes, NEU v1.2) ───────────────────────────
    CGUASError: {
        SegmentSpaceExhausted: (segment) => cge('CG-E-010.001', 'CGUASError', 'FATAL', 'Registry', 'Segment hat keinen Platz mehr', { segment }),
        SegmentNotFound: (address) => cge('CG-E-010.002', 'CGUASError', 'FATAL', 'Registry', 'CGUA-Adresse liegt in keinem registrierten Segment', { address: address.toString() }),
        SegmentOverlap: (ctx) => cge('CG-E-010.003', 'CGUASError', 'FATAL', 'Registry', 'Zwei Segmente überlappen (darf nie auftreten)', ctx),
        SegmentTooSmall: (requested, minimum) => cge('CG-E-010.004', 'CGUASError', 'FATAL', 'Registry', 'Angefordertes Segment kleiner als Mindestgröße', { requested: requested.toString(), minimum: minimum.toString() }),
        SegmentTooLarge: (requested, maximum) => cge('CG-E-010.005', 'CGUASError', 'FATAL', 'Registry', 'Angefordertes Segment größer als Maximalgrenze', { requested: requested.toString(), maximum: maximum.toString() }),
        SegmentOwnerMismatch: (address, owner) => cge('CG-E-010.006', 'CGUASError', 'FATAL', 'Registry', 'CGUA-Adresse liegt im Segment einer anderen Organisation', { address: address.toString(), owner }),
        IntegrityViolation: (ctx) => cge('CG-E-010.007', 'CGUASError', 'FATAL', 'Registry', 'SHA-256-Hash des Segments stimmt nicht — Manipulation', ctx),
        AddressOutOfRange: (value) => cge('CG-E-010.008', 'CGUASError', 'FATAL', 'Engine', 'CGUA-Wert außerhalb des CGUAS-Adressraums', { value: value.toString() }),
    },
    // ── CG-E-011 CGFSError (12 Sub-Codes, NEU v1.2 + v1.4) ───────────────────
    CGFSError: {
        ManifestMissing: () => cge('CG-E-011.001', 'CGFSError', 'FATAL', 'Validator', 'CGFS-Datei hat kein Manifest'),
        ManifestInvalidJSON: () => cge('CG-E-011.002', 'CGFSError', 'FATAL', 'Validator', 'Manifest ist kein gültiges JSON'),
        ManifestMissingField: (field) => cge('CG-E-011.003', 'CGFSError', 'FATAL', 'Validator', `Pflichtfeld im Manifest fehlt: ${field}`, { field }),
        ManifestIntegrityViolation: () => cge('CG-E-011.004', 'CGFSError', 'FATAL', 'Validator', 'content_hash stimmt nicht mit Inhalt überein'),
        DeprecatedTypeUsed: (typeId) => cge('CG-E-011.005', 'CGFSError', 'ERROR', 'Validator', `Veralteter Dateityp verwendet: ${typeId}`, { typeId }),
        TypeNotFound: (typeId) => cge('CG-E-011.006', 'CGFSError', 'FATAL', 'Validator', `Dateityp nicht in CGFS-Registry: ${typeId}`, { typeId }),
        RetentionViolation: (specified, minimum) => cge('CG-E-011.007', 'CGFSError', 'FATAL', 'Validator', 'Retention unterschreitet Typ-Mindest-Retention', { specified, minimum }),
        CGFIMismatch: (expected, got) => cge('CG-E-011.008', 'CGFSError', 'FATAL', 'Validator', 'CGFI stimmt nicht mit berechnetem Wert überein', { expected, got }),
        TombstoneExists: (cgfi) => cge('CG-E-011.009', 'CGFSError', 'FATAL', 'Validator', 'Datei wurde logisch gelöscht (Tombstone)', { cgfi }),
        NamespaceConflict: (cgfi, namespace) => cge('CG-E-011.010', 'CGFSError', 'FATAL', 'Validator', 'Zwei Dateien mit identischer CGFI im selben Namespace', { cgfi, namespace }),
        QKDCollision: (ctx) => cge('CG-E-011.011', 'CGFSError', 'FATAL', 'Engine', 'CGTA-Kollision innerhalb QKD-Link-Domäne (I-QKD-1)', ctx),
        QKDDomainReuse: (domainId) => cge('CG-E-011.012', 'CGFSError', 'FATAL', 'Engine', `QKD-Link-Domänen-ID über mehrere parallele Kanäle wiederverwendet (R-QKD2): ${domainId}`, { domainId }),
    },
};
