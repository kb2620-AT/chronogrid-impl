/**
 * cg-engine/src/mapping.ts
 * Mapping-Ausführung — CG-STD-3100 v1.5 Kap. 8
 * Piecewise-linear (Klasse A) + Lookup (Schaltsekunden)
 * Pure functions — kein Netzwerkzugriff, kein externer Zustand (Kap. 2.3)
 */
import { Errors } from '../../cg-types/src/errors.ts';
import { LEAP_SECONDS } from '../../cg-engine/src/engine.ts';
export function executeLinearMapping(sourceNs, rule) {
    if (rule.denominator === 0n) {
        throw Errors.MappingError.DivisionByZero({ rule });
    }
    return (sourceNs * rule.slope) / rule.denominator + rule.offset;
}
// ── Schaltsekunden-Lookup (Kap. 8.5, normativ) ────────────────────────────────
// Binärsuche: größter Eintrag mit entry.utcFrom <= utc
export function lookupTaiOffset(utcSeconds) {
    // Vor 1972-01-01: kein normierter Offset (Fehler)
    if (utcSeconds < BigInt('63072000')) { // 1972-01-01 00:00:00 UTC
        throw Errors.MappingError.RefPointOutOfExtent({
            reason: 'UTC vor 1972-01-01 — kein normierter TAI-Offset',
            utcSeconds: utcSeconds.toString(),
        });
    }
    let lo = 0;
    let hi = LEAP_SECONDS.length - 1;
    let result = 10; // TAI-UTC 1972-01-01 Basiswert
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (LEAP_SECONDS[mid].utcSeconds <= utcSeconds) {
            result = LEAP_SECONDS[mid].taiOffset;
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return result;
}
/** UTC-Sekunden → TAI-Sekunden (piecewise-linear via normative Schaltsekunden-Tabelle) */
export function utcToTai(utcSeconds) {
    const offset = lookupTaiOffset(utcSeconds);
    return utcSeconds + BigInt(offset);
}
/** TAI-Sekunden → UTC-Sekunden (inverse piecewise-linear) */
export function taiToUtc(taiSeconds) {
    // Iterativ konvergieren (max. 3 Iterationen ausreichend)
    let offset = 37; // Heuristik: aktueller Wert
    for (let i = 0; i < 3; i++) {
        const approxUtc = taiSeconds - BigInt(offset);
        try {
            offset = lookupTaiOffset(approxUtc);
        }
        catch {
            break; // vor 1972 — offset bleibt bei Heuristik
        }
    }
    return taiSeconds - BigInt(offset);
}
/** UTC-Nanosekunden → TAI-Nanosekunden */
export function utcNsToTaiNs(utcNs) {
    const utcSec = utcNs / BigInt(1_000_000_000);
    const utcSubNs = utcNs % BigInt(1_000_000_000);
    const offset = BigInt(lookupTaiOffset(utcSec));
    return (utcSec + offset) * BigInt(1_000_000_000) + utcSubNs;
}
/** TAI-Nanosekunden → UTC-Nanosekunden */
export function taiNsToUtcNs(taiNs) {
    const taiSec = taiNs / BigInt(1_000_000_000);
    const taiSubNs = taiNs % BigInt(1_000_000_000);
    const utcSec = taiToUtc(taiSec);
    return utcSec * BigInt(1_000_000_000) + taiSubNs;
}
// ── GPS ↔ TAI (linear, konstant +19s) ────────────────────────────────────────
// GPS-Epoche: 1980-01-06T00:00:00Z = TAI + 19s (kein Schaltsekunden-Update nötig)
const GPS_TAI_OFFSET_S = 19n;
const GPS_TAI_OFFSET_NS = GPS_TAI_OFFSET_S * BigInt(1_000_000_000);
/** GPS-Nanosekunden → TAI-Nanosekunden */
export function gpsNsToTaiNs(gpsNs) {
    return gpsNs + GPS_TAI_OFFSET_NS;
}
/** TAI-Nanosekunden → GPS-Nanosekunden */
export function taiNsToGpsNs(taiNs) {
    return taiNs - GPS_TAI_OFFSET_NS;
}
// ── Unix ↔ TAI (piecewise-linear) ────────────────────────────────────────────
// Unix ignoriert Schaltsekunden (POSIX) — TAI ist linear und korrekt.
// Hinweis: Unix → TAI ist nicht bijektiv an Schaltsekunden-Punkten.
/** Unix-Nanosekunden → TAI-Nanosekunden */
export function unixNsToTaiNs(unixNs) {
    // Unix ist identisch UTC aus ChronoGrid-Sicht (piecewise-linear)
    return utcNsToTaiNs(unixNs);
}
/** TAI-Nanosekunden → Unix-Nanosekunden */
export function taiNsToUnixNs(taiNs) {
    return taiNsToUtcNs(taiNs);
}
/**
 * Konvertiert einen TAI-Nanosekunden-Wert in eine Ziel-Domain.
 * Dies ist das zentrale Interface für alle Level-1/2-Konvertierungen.
 */
export function taiNsToTarget(taiNs, targetDomain) {
    switch (targetDomain.toLowerCase()) {
        case 'tai': return taiNs;
        case 'utc': return taiNsToUtcNs(taiNs);
        case 'unix': return taiNsToUnixNs(taiNs);
        case 'gps': return taiNsToGpsNs(taiNs);
        default:
            throw Errors.MappingError.TargetDomainNotFound(targetDomain);
    }
}
/**
 * Konvertiert einen Quell-Domain-Wert zu TAI-Nanosekunden.
 */
export function sourceToTaiNs(sourceNs, sourceDomain) {
    switch (sourceDomain.toLowerCase()) {
        case 'tai': return sourceNs;
        case 'utc': return utcNsToTaiNs(sourceNs);
        case 'unix': return unixNsToTaiNs(sourceNs);
        case 'gps': return gpsNsToTaiNs(sourceNs);
        default:
            throw Errors.MappingError.TargetDomainNotFound(sourceDomain);
    }
}
/**
 * Vollständige Konvertierung: Quelle → TAI → Ziel (normativ).
 * Mapping-Kette: source → TAI → target (max. 2 Schritte für Level 1/2).
 * Längere Ketten: CG-STD-3100 Kap. 8, max. 8 Schritte (CG-E-005.010).
 */
export function convert(valueNs, sourceDomain, targetDomain) {
    const taiNs = sourceToTaiNs(valueNs, sourceDomain);
    return taiNsToTarget(taiNs, targetDomain);
}
