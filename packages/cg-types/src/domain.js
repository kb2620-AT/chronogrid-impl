/**
 * cg-types/src/domain.ts
 * Kerndatentypen für CTDDL-Domains — CG-STD-2100 v1.4
 * Alle Typen sind normativ. Kommentare referenzieren Kapitel.
 */
// ── String-Kodierung (normativ) ───────────────────────────────────────────────
export function encodeCGTA(cgta) {
    const sig = cgta.sigma !== undefined ? `:σ${cgta.sigma}` : '';
    return `CG:${cgta.domain}:${cgta.value}${sig}/v${cgta.version}`;
}
// Regex für CGTA-Parsing (ABNF CG-STD-2100 Kap. 4.1)
const CGTA_REGEX = /^CG:([^:]+):(-?\d+)(?::σ(\d+))?\/v(\d+)$/;
export function parseCGTA(raw) {
    const m = CGTA_REGEX.exec(raw);
    if (!m) {
        throw new Error(`CG-E-001.007: Ungültiges CGTA-Format: ${raw}`);
    }
    const result = {
        domain: m[1],
        value: BigInt(m[2]),
        version: parseInt(m[4], 10),
    };
    if (m[3] !== undefined) {
        result.sigma = BigInt(m[3]);
    }
    return result;
}
// ── Fehlerstruktur re-export ──────────────────────────────────────────────────
export { CGError, Errors } from './errors.ts';
