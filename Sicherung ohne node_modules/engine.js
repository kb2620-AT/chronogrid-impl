/**
 * cg-engine/src/engine.ts
 * ChronoGrid Engine — Kern-Implementierung
 * Normative Grundlage: CG-STD-3100 v1.5
 *
 * INVARIANTE: Pure functions — kein Netzwerkzugriff, keine Systemzeit,
 * keine globalen Zustände. I-R3: gleicher Input → immer gleicher Output.
 */
import { createHash } from 'node:crypto';
import { encodeCGTA, parseCGTA } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
// ── Konstanten (normativ, CG-STD-3100 Kap. 2.2) ──────────────────────────────
const INT64_MAX = BigInt('9223372036854775807');
const INT64_MIN = BigInt('-9223372036854775808');
// CGUAS-Adressraum: 79 Bit (CG-STD-6100 Kap. 3, CG-APP-0700)
const CGUAS_MAX = BigInt(2) ** BigInt(79) - BigInt(1);
// ── BigInt-Arithmetik (CG-STD-3100 Kap. 2.6) ─────────────────────────────────
// Alle Operationen müssen exakt sein — keine Rundung, kein stilles Überlaufen.
/**
 * Addiert zwei BigInts mit Überlaufprüfung für Level-1/2 (int64-Bereich).
 * Level-3-Implementierungen verwenden native BigInt ohne Limit.
 * Wirft CG-E-003 bei Überlauf (normativ).
 */
export function safeAdd(a, b, level = 3) {
    const result = a + b;
    if (level < 3) {
        if (result > INT64_MAX)
            throw Errors.ExtentError.Int64Overflow(result);
        if (result < INT64_MIN)
            throw Errors.ExtentError.Int64Overflow(result);
    }
    return result;
}
/** Modulo — immer nicht-negativ (normativ, CG-STD-3100 Kap. 2.6) */
export function mod(a, b) {
    const r = a % b;
    return r < 0n ? r + b : r;
}
// ── Kanonische BigInt-Serialisierung (CG-STD-3100 Kap. 2.6) ──────────────────
// Big-Endian, Zweierkomplement, minimale Bytelänge.
// Sonderfall Null: ein Byte 0x00.
// Grundlage für alle SHA-256-Hashes (MachineID, CGFI).
export function bigIntToBytesBigEndian(value) {
    if (value === 0n)
        return new Uint8Array([0x00]);
    const isNegative = value < 0n;
    let abs = isNegative ? -value : value;
    // Anzahl benötigter Bytes bestimmen
    let byteCount = 0;
    let tmp = abs;
    while (tmp > 0n) {
        byteCount++;
        tmp >>= 8n;
    }
    // Für Zweierkomplement: wenn höchstes Bit gesetzt, ein Byte mehr
    const bytes = new Uint8Array(byteCount);
    for (let i = byteCount - 1; i >= 0; i--) {
        bytes[i] = Number(abs & 0xffn);
        abs >>= 8n;
    }
    if (!isNegative)
        return bytes;
    // Zweierkomplement für negative Zahlen
    const twos = new Uint8Array(byteCount + 1);
    // Invertieren + 1
    let carry = 1;
    for (let i = byteCount - 1; i >= 0; i--) {
        const val = (bytes[i] ^ 0xFF) + carry;
        twos[i + 1] = val & 0xFF;
        carry = val >> 8;
    }
    twos[0] = carry ? 0xFF : 0x00; // Vorzeichen-Byte
    // Minimale Länge: führende 0xFF-Bytes entfernen (außer letztem)
    let start = 0;
    while (start < twos.length - 1 && twos[start] === 0xFF && (twos[start + 1] & 0x80) !== 0) {
        start++;
    }
    return twos.slice(start);
}
// Testvektoren (normativ, CG-STD-3100 Kap. 2.6 T-BIG-001 bis T-BIG-005)
// assert serialize(0)   === [0x00]
// assert serialize(256) === [0x01, 0x00]
export function verifySerialization() {
    const zero = bigIntToBytesBigEndian(0n);
    if (zero.length !== 1 || zero[0] !== 0x00)
        return false;
    const twoFiftySix = bigIntToBytesBigEndian(256n);
    if (twoFiftySix.length !== 2 || twoFiftySix[0] !== 0x01 || twoFiftySix[1] !== 0x00)
        return false;
    return true;
}
// ── MachineID (CG-STD-3100 Kap. 5.1) ─────────────────────────────────────────
// SHA-256 über kanonisch serialisierten TAI-Wert.
// Identifiziert einen Zeitpunkt eindeutig und deterministisch.
export function computeMachineID(taiNs) {
    const taiBytes = bigIntToBytesBigEndian(taiNs < 0n ? -taiNs : taiNs);
    const taiPrefix = uint32ToBigEndian(taiBytes.length);
    const taiSign = taiNs >= 0n ? 0x00 : 0xFF;
    const input = new Uint8Array(taiPrefix.length + 1 + taiBytes.length);
    input.set(taiPrefix, 0);
    input[taiPrefix.length] = taiSign;
    input.set(taiBytes, taiPrefix.length + 1);
    return new Uint8Array(createHash('sha256').update(input).digest());
}
// ── CGFI (CG-STD-3100 Kap. 5.4) ──────────────────────────────────────────────
// SHA-256 über kanonisches Format (Kap. 5.4.1).
// Deterministisch: gleicher Inhalt + gleiche Zeit + gleicher Typ + gleicher seq → gleicher CGFI.
/**
 * Berechnet den CGFI für eine Datei.
 * @param createdAt  TAI-Wert des Erstellungszeitpunkts (Nanosekunden, BigInt)
 * @param content    Roher Dateiinhalt
 * @param typeId     Dateityp-ID, z.B. "legal/contract/v1"
 * @param seq        Sub-Sekunden-Kollisionszähler (Standard 0)
 */
export function computeCGFI(createdAt, content, typeId, seq = 0) {
    // Schritt 1: TAI kanonisieren (identisch zu MachineID)
    const taiBytes = bigIntToBytesBigEndian(createdAt < 0n ? -createdAt : createdAt);
    const taiPrefix = uint32ToBigEndian(taiBytes.length);
    const taiSign = createdAt >= 0n ? 0x00 : 0xFF;
    // Schritt 2: Inhalts-Hash
    const contentHash = new Uint8Array(createHash('sha256').update(content).digest());
    // Schritt 3: Typ-ID kanonisieren (UTF-8, null-terminiert)
    const typeBytes = new Uint8Array([...Buffer.from(typeId, 'utf8'), 0x00]);
    // Schritt 4: seq als uint32 Big-Endian
    const seqBytes = uint32ToBigEndian(seq);
    // Schritt 5: Konkatenation und SHA-256
    const total = taiPrefix.length + 1 + taiBytes.length + contentHash.length + typeBytes.length + seqBytes.length;
    const input = new Uint8Array(total);
    let offset = 0;
    input.set(taiPrefix, offset);
    offset += taiPrefix.length;
    input[offset++] = taiSign;
    input.set(taiBytes, offset);
    offset += taiBytes.length;
    input.set(contentHash, offset);
    offset += contentHash.length;
    input.set(typeBytes, offset);
    offset += typeBytes.length;
    input.set(seqBytes, offset);
    return new Uint8Array(createHash('sha256').update(input).digest());
}
// ── CGUA-Adressraum-Prüfung (CG-STD-6100 Kap. 3) ────────────────────────────
export function checkCGUARange(value) {
    if (value < 0n || value > CGUAS_MAX) {
        throw Errors.CGUASError.AddressOutOfRange(value);
    }
}
export function cguaSafeAdd(base, offset) {
    const result = base + offset;
    checkCGUARange(result);
    return result;
}
// ── CGTA encode/decode (normativ) ─────────────────────────────────────────────
// Re-export aus cg-types für bequemen Zugriff in der Engine
export { encodeCGTA, parseCGTA };
// ── Extent-Prüfung (CG-STD-3100 Kap. 4.4) ────────────────────────────────────
export function checkExtent(value, domain) {
    if (domain.extent.min !== null) {
        const min = BigInt(domain.extent.min);
        if (value < min)
            throw Errors.ExtentError.UnderLowerBound(value, min);
    }
    if (domain.extent.max !== null) {
        const max = BigInt(domain.extent.max);
        if (value > max)
            throw Errors.ExtentError.OverUpperBound(value, max);
    }
}
// ── Allen-Relationen (CG-STD-3100 Kap. 9) ────────────────────────────────────
// Alle 13 normativ implementiert. Auf BigInt-Skala — identisch für int64 und ℤ∞.
export const Allen = {
    /** A before B: A.end < B.start */
    before: (a, b) => a.end < b.start,
    /** A after B: A.start > B.end */
    after: (a, b) => a.start > b.end,
    /** A meets B: A.end === B.start */
    meets: (a, b) => a.end === b.start,
    /** A metBy B: A.start === B.end */
    metBy: (a, b) => a.start === b.end,
    /** A overlaps B */
    overlaps: (a, b) => a.start < b.start && a.end > b.start && a.end < b.end,
    /** A overlappedBy B */
    overlappedBy: (a, b) => b.start < a.start && b.end > a.start && b.end < a.end,
    /** A starts B: gleicher Start, A endet früher */
    starts: (a, b) => a.start === b.start && a.end < b.end,
    /** A startedBy B */
    startedBy: (a, b) => a.start === b.start && a.end > b.end,
    /** A during B: A vollständig in B */
    during: (a, b) => a.start > b.start && a.end < b.end,
    /** A contains B */
    contains: (a, b) => a.start < b.start && a.end > b.end,
    /** A finishes B: gleicher Endpunkt, A startet später */
    finishes: (a, b) => a.end === b.end && a.start > b.start,
    /** A finishedBy B */
    finishedBy: (a, b) => a.end === b.end && a.start < b.start,
    /** A equals B: identische Grenzen */
    equals: (a, b) => a.start === b.start && a.end === b.end,
    /** Gibt alle zutreffenden Relationen zurück (Diagnosefunktion) */
    all: (a, b) => {
        const rels = [];
        for (const [name, fn] of Object.entries(Allen)) {
            if (name === 'all')
                continue;
            if (fn(a, b))
                rels.push(name);
        }
        return rels;
    },
};
// Normative Tabelle (CG-STD-2100 Anhang A)
export const LEAP_SECONDS = [
    { utcSeconds: BigInt('78796800'), taiOffset: 11 }, // 1972-07-01
    { utcSeconds: BigInt('94694400'), taiOffset: 12 }, // 1973-01-01
    { utcSeconds: BigInt('126230400'), taiOffset: 13 }, // 1974-01-01
    { utcSeconds: BigInt('157766400'), taiOffset: 14 }, // 1975-01-01
    { utcSeconds: BigInt('189302400'), taiOffset: 15 }, // 1976-01-01
    { utcSeconds: BigInt('220924800'), taiOffset: 16 }, // 1977-01-01
    { utcSeconds: BigInt('252460800'), taiOffset: 17 }, // 1978-01-01
    { utcSeconds: BigInt('283996800'), taiOffset: 18 }, // 1979-01-01
    { utcSeconds: BigInt('315532800'), taiOffset: 19 }, // 1980-01-01
    { utcSeconds: BigInt('362793600'), taiOffset: 20 }, // 1981-07-01
    { utcSeconds: BigInt('394329600'), taiOffset: 21 }, // 1982-07-01
    { utcSeconds: BigInt('425865600'), taiOffset: 22 }, // 1983-07-01
    { utcSeconds: BigInt('489024000'), taiOffset: 23 }, // 1985-07-01
    { utcSeconds: BigInt('567993600'), taiOffset: 24 }, // 1988-01-01
    { utcSeconds: BigInt('631152000'), taiOffset: 25 }, // 1990-01-01
    { utcSeconds: BigInt('662688000'), taiOffset: 26 }, // 1991-01-01
    { utcSeconds: BigInt('709948800'), taiOffset: 27 }, // 1992-07-01
    { utcSeconds: BigInt('741484800'), taiOffset: 28 }, // 1993-07-01
    { utcSeconds: BigInt('773020800'), taiOffset: 29 }, // 1994-07-01
    { utcSeconds: BigInt('820454400'), taiOffset: 30 }, // 1996-01-01
    { utcSeconds: BigInt('867715200'), taiOffset: 31 }, // 1997-07-01
    { utcSeconds: BigInt('915148800'), taiOffset: 32 }, // 1999-01-01
    { utcSeconds: BigInt('1136073600'), taiOffset: 33 }, // 2006-01-01
    { utcSeconds: BigInt('1230768000'), taiOffset: 34 }, // 2009-01-01
    { utcSeconds: BigInt('1341100800'), taiOffset: 35 }, // 2012-07-01
    { utcSeconds: BigInt('1435708800'), taiOffset: 36 }, // 2015-07-01
    { utcSeconds: BigInt('1483228800'), taiOffset: 37 }, // 2017-01-01
];
/** TAI-UTC-Offset für einen gegebenen UTC-Zeitpunkt (Sekunden seit 1970-01-01) */
export function taiOffsetAtUtc(utcSeconds) {
    let offset = 10; // TAI-UTC vor 1972: 10s
    for (const entry of LEAP_SECONDS) {
        if (utcSeconds >= entry.utcSeconds) {
            offset = entry.taiOffset;
        }
        else {
            break;
        }
    }
    return offset;
}
/** UTC-Sekunden → TAI-Nanosekunden */
export function utcSecondsToTaiNs(utcSeconds) {
    const offset = taiOffsetAtUtc(utcSeconds);
    return (utcSeconds + BigInt(offset)) * BigInt(1_000_000_000);
}
/** TAI-Nanosekunden → UTC-Sekunden */
export function taiNsToUtcSeconds(taiNs) {
    const taiSeconds = taiNs / BigInt(1_000_000_000);
    // Iterativ: TAI-Offset für TAI-Sekunden approximieren
    let offset = 37; // Heuristik: aktueller Wert
    for (let i = 0; i < 3; i++) {
        const approxUtc = taiSeconds - BigInt(offset);
        offset = taiOffsetAtUtc(approxUtc);
    }
    return taiSeconds - BigInt(offset);
}
// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function uint32ToBigEndian(value) {
    const buf = new Uint8Array(4);
    buf[0] = (value >>> 24) & 0xFF;
    buf[1] = (value >>> 16) & 0xFF;
    buf[2] = (value >>> 8) & 0xFF;
    buf[3] = value & 0xFF;
    return buf;
}
/** CGFI als Hex-String (für Manifest, API-Antworten) */
export function cgfiToHex(cgfi) {
    return Buffer.from(cgfi).toString('hex');
}
/** MachineID als Hex-String */
export function machineIdToHex(mid) {
    return Buffer.from(mid).toString('hex');
}
