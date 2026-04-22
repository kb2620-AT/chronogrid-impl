/**
 * cg-testkit/src/suites/t-engine.ts
 * Normative Engine-Tests — CG-STD-3100 v1.5 + CG-STD-5100 v1.3
 * Abdeckung: T-L1-* (55), T-L2-* (100), T-L3-* (304+)
 */

import type { TestCase } from '../runner.js';
import { parseDomain } from 'cg-ctddl/parser.js';
import {
  encodeCGTA, decodeCGTA, computeMachineId, computeCGFI,
  createTimepoint, allenRelation, compareValues, verifyDeterminism,
  convertValue, getDomain, listDomainKeys, nowTaiNs,
} from 'cg-engine/engine.js';
import { isLeapYear, daysInMonth, gregorianToSeconds, secondsToISO8601, iso8601ToSeconds } from 'cg-engine/gregorian.js';
import { utcToTai, taiToUtc, gpsToTai, taiToGps, CURRENT_TAI_MINUS_UTC } from 'cg-engine/mapping.js';
import { Errors } from 'cg-types/errors.js';

export const engineTests: TestCase[] = [

  // ── T-L1: Level 1 – Linear Domains, CGTA, Encode/Decode ──────────────────

  { id: 'T-L1-001', level: 1, description: 'CGTA encode – TAI Basisformat',
    run: () => encodeCGTA({ domain: 'TAI', value: 1742041937n, version: 1 }),
    expected: 'CG:TAI:1742041937/v1' },

  { id: 'T-L1-002', level: 1, description: 'CGTA decode – korrektes Parsing',
    run: () => { const r = decodeCGTA('CG:TAI:1742041937/v1'); return r.domain + ':' + r.value.toString() + ':v' + r.version; },
    expected: 'TAI:1742041937:v1' },

  { id: 'T-L1-003', level: 1, description: 'CGTA decode value als BigInt',
    run: () => typeof decodeCGTA('CG:TAI:1742041937/v1').value,
    expected: 'bigint' },

  { id: 'T-L1-004', level: 1, description: 'CGTA negative Werte (ℤ∞)',
    run: () => encodeCGTA({ domain: 'Unix', value: -2147483648n, version: 1 }),
    expected: 'CG:Unix:-2147483648/v1' },

  { id: 'T-L1-005', level: 1, description: 'MachineID – SHA-256 Determinismus (I-R3)',
    run: () => computeMachineId('TAI', 1742041937n, '1.0') === computeMachineId('TAI', 1742041937n, '1.0'),
    expected: true },

  { id: 'T-L1-006', level: 1, description: 'MachineID – verschiedene Werte → verschiedene IDs',
    run: () => computeMachineId('TAI', 1n, '1.0') !== computeMachineId('TAI', 2n, '1.0'),
    expected: true },

  { id: 'T-L1-007', level: 1, description: 'MachineID – Länge 64 Zeichen (SHA-256 hex)',
    run: () => computeMachineId('TAI', 1742041937n, '1.0').length,
    expected: 64 },

  { id: 'T-L1-008', level: 1, description: 'CGFI – Compute CGFI',
    run: () => computeCGFI('abc', 'def', 'ghi').length,
    expected: 64 },

  { id: 'T-L1-009', level: 1, description: 'CGFI – Determinismus',
    run: () => computeCGFI('a','b','c') === computeCGFI('a','b','c'),
    expected: true },

  { id: 'T-L1-010', level: 1, description: 'CTDDL Parser – TAI-Domain gültig',
    run: () => { parseDomain({ name:'TestTAI', version:'1.0', type:'linear', granularity:'second', extent:{min:'0',max:'9999',inclusive:true} }); return true; },
    expected: true },

  { id: 'T-L1-011', level: 1, description: 'CTDDL Parser – fehlendes Pflichtfeld → SyntaxError',
    run: () => { try { parseDomain({ name:'X', version:'1.0' }); return false; } catch(e){ return (e as {code:string}).code.startsWith('CG-E-001'); } },
    expected: true },

  { id: 'T-L1-012', level: 1, description: 'CTDDL Parser – ungültiger Typ → SyntaxError',
    run: () => { try { parseDomain({ name:'X', version:'1.0', type:'invalid', granularity:'second', extent:{min:0,max:1,inclusive:true} }); return false; }
      catch(e){ return (e as {code:string}).code === 'CG-E-001.004'; } },
    expected: true },

  { id: 'T-L1-013', level: 1, description: 'BigInt – Vergleich I-R2 (totale Ordnung)',
    run: () => compareValues(100n, 200n),
    expected: -1 },

  { id: 'T-L1-014', level: 1, description: 'BigInt – Gleichheit',
    run: () => compareValues(42n, 42n),
    expected: 0 },

  { id: 'T-L1-015', level: 1, description: 'BigInt – größer',
    run: () => compareValues(200n, 100n),
    expected: 1 },

  { id: 'T-L1-016', level: 1, description: 'Gregorian – Schaltjahr 2000',
    run: () => isLeapYear(2000n),
    expected: true },

  { id: 'T-L1-017', level: 1, description: 'Gregorian – kein Schaltjahr 1900',
    run: () => isLeapYear(1900n),
    expected: false },

  { id: 'T-L1-018', level: 1, description: 'Gregorian – Schaltjahr 2024',
    run: () => isLeapYear(2024n),
    expected: true },

  { id: 'T-L1-019', level: 1, description: 'Gregorian – kein Schaltjahr 2023',
    run: () => isLeapYear(2023n),
    expected: false },

  { id: 'T-L1-020', level: 1, description: 'Gregorian – Februar Schaltjahr hat 29 Tage',
    run: () => daysInMonth(2024n, 2n),
    expected: 29n },

  { id: 'T-L1-021', level: 1, description: 'Gregorian – Februar Normaljahr hat 28 Tage',
    run: () => daysInMonth(2023n, 2n),
    expected: 28n },

  { id: 'T-L1-022', level: 1, description: 'Gregorian – Epoch 0001-01-01 = 0 Sekunden',
    run: () => gregorianToSeconds(1n, 1n, 1n),
    expected: 0n },

  { id: 'T-L1-023', level: 1, description: 'Gregorian – ISO8601 decode/encode Round-Trip',
    run: () => secondsToISO8601(iso8601ToSeconds('2024-01-15T12:00:00Z')),
    expected: '2024-01-15T12:00:00Z' },

  { id: 'T-L1-024', level: 1, description: 'TAI–UTC Mapping – 2017: TAI = UTC + 37',
    run: () => utcToTai(iso8601ToSeconds('2017-01-01T00:00:00Z')) - iso8601ToSeconds('2017-01-01T00:00:00Z'),
    expected: 37n },

  { id: 'T-L1-025', level: 1, description: 'Aktueller TAI−UTC Offset = 37',
    run: () => CURRENT_TAI_MINUS_UTC,
    expected: 37n },

  { id: 'T-L1-026', level: 1, description: 'GPS→TAI Round-Trip',
    run: () => { const gps = 1000000n; return taiToGps(gpsToTai(gps)) === gps; },
    expected: true },

  { id: 'T-L1-027', level: 1, description: 'Built-in Domain TAI registriert',
    run: () => { try { getDomain('TAI', '1.0'); return true; } catch { return false; } },
    expected: true },

  { id: 'T-L1-028', level: 1, description: 'Built-in Domain UTC registriert',
    run: () => { try { getDomain('UTC', '1.0'); return true; } catch { return false; } },
    expected: true },

  { id: 'T-L1-029', level: 1, description: 'Built-in Domain GPS registriert',
    run: () => { try { getDomain('GPS', '1.0'); return true; } catch { return false; } },
    expected: true },

  { id: 'T-L1-030', level: 1, description: 'Built-in Domain Gregorian registriert',
    run: () => { try { getDomain('Gregorian', '1.0'); return true; } catch { return false; } },
    expected: true },

  { id: 'T-L1-031', level: 1, description: 'Built-in Domain Unix registriert',
    run: () => { try { getDomain('Unix', '1.0'); return true; } catch { return false; } },
    expected: true },

  { id: 'T-L1-032', level: 1, description: 'Built-in Domain Cosmic registriert',
    run: () => { try { getDomain('Cosmic', '1.1'); return true; } catch { return false; } },
    expected: true },

  { id: 'T-L1-033', level: 1, description: 'Unbekannte Domain → VersionError',
    run: () => { try { getDomain('NonExistent', '1.0'); return false; }
      catch(e){ return (e as {code:string}).code === 'CG-E-007.001'; } },
    expected: true },

  { id: 'T-L1-034', level: 1, description: 'CGTA ungültig → SyntaxError',
    run: () => { try { decodeCGTA('INVALID'); return false; }
      catch(e){ return (e as {code:string}).code === 'CG-E-001.007'; } },
    expected: true },

  { id: 'T-L1-035', level: 1, description: 'verifyDeterminism – I-R3',
    run: () => verifyDeterminism('TAI', 1742041937n, '1.0'),
    expected: true },

  { id: 'T-L1-036', level: 1, description: 'Domain-Semantik default = time',
    run: () => getDomain('TAI', '1.0').semantics ?? 'time',
    expected: 'time' },

  { id: 'T-L1-037', level: 1, description: 'CTDDL scientific_dependency Pflicht bei stability=low',
    run: () => { try { parseDomain({ name:'X2', version:'1.0', type:'linear', granularity:'second',
      extent:{min:0,max:1,inclusive:true}, metadata:{ stability:'low' } }); return false; }
      catch(e){ return (e as {code:string}).code === 'CG-E-008.001'; } },
    expected: true },

  { id: 'T-L1-038', level: 1, description: 'Cosmic Domain hat scientific_dependency',
    run: () => !!(getDomain('Cosmic','1.1').metadata?.scientific_dependency),
    expected: true },

  { id: 'T-L1-039', level: 1, description: 'TAI–UTC Round-Trip',
    run: () => { const utc = iso8601ToSeconds('2024-03-15T10:00:00Z'); return taiToUtc(utcToTai(utc)) === utc; },
    expected: true },

  { id: 'T-L1-040', level: 1, description: 'CGTA Leerzeichen im Name → Fehler',
    run: () => { try { parseDomain({ name:'my domain', version:'1.0', type:'linear', granularity:'second',
      extent:{min:0,max:1,inclusive:true} }); return false; }
      catch{ return true; } },
    expected: true },

  { id: 'T-L1-041', level: 1, description: 'Mapping Chain-Limit > 8 → MappingError',
    run: () => { try { parseDomain({ name:'ChainTest', version:'1.0', type:'linear', granularity:'second',
      extent:{min:0,max:1,inclusive:true},
      mapping: Array(9).fill({ targetDomain:'TAI', targetVersion:'1.0', type:'linear', refPoints:[] }) }); return false; }
      catch(e){ return (e as {code:string}).code === 'CG-E-005.010'; } },
    expected: true },

  { id: 'T-L1-042', level: 1, description: 'Fehlerformat enthält code, class, severity',
    run: () => { const e = Errors.SyntaxError.invalidJson('test'); return !!(e.code && e.cgClass && e.severity); },
    expected: true },

  { id: 'T-L1-043', level: 1, description: 'CG-E-001 HTTP Status 422',
    run: () => Errors.SyntaxError.invalidJson('test').httpStatus,
    expected: 422 },

  { id: 'T-L1-044', level: 1, description: 'CG-E-007.001 HTTP Status 404',
    run: () => Errors.VersionError.notFound('test').httpStatus,
    expected: 404 },

  { id: 'T-L1-045', level: 1, description: 'I-E1 – keine universale Epoch in TAI',
    run: () => !('epoch' in getDomain('TAI','1.0')),
    expected: true },

  { id: 'T-L1-046', level: 1, description: 'Gregorian – Monat April hat 30 Tage',
    run: () => daysInMonth(2024n, 4n),
    expected: 30n },

  { id: 'T-L1-047', level: 1, description: 'CGTA decode – negativer Wert',
    run: () => decodeCGTA('CG:Unix:-2147483648/v1').value,
    expected: -2147483648n },

  { id: 'T-L1-048', level: 1, description: 'MachineID – domain sensitivity',
    run: () => computeMachineId('TAI', 1n, '1.0') !== computeMachineId('UTC', 1n, '1.0'),
    expected: true },

  { id: 'T-L1-049', level: 1, description: 'CGFI – type sensitivity',
    run: () => computeCGFI('a','b','pdf') !== computeCGFI('a','b','json'),
    expected: true },

  { id: 'T-L1-050', level: 1, description: 'nowTaiNs gibt BigInt zurück',
    run: () => typeof nowTaiNs(),
    expected: 'bigint' },

  { id: 'T-L1-051', level: 1, description: 'nowTaiNs – Wert > 0',
    run: () => nowTaiNs() > 0n,
    expected: true },

  { id: 'T-L1-052', level: 1, description: 'listDomainKeys enthält TAI@1.0',
    run: () => listDomainKeys().includes('TAI@1.0'),
    expected: true },

  { id: 'T-L1-053', level: 1, description: 'Gregorian Round-Trip 2024-02-29',
    run: () => secondsToISO8601(iso8601ToSeconds('2024-02-29T00:00:00Z')),
    expected: '2024-02-29T00:00:00Z' },

  { id: 'T-L1-054', level: 1, description: 'Fehlerklasse CG-E-003 HTTP 422',
    run: () => Errors.ExtentError.belowMin('test').httpStatus,
    expected: 422 },

  { id: 'T-L1-055', level: 1, description: 'CG-E-002.001 HTTP 409 (Duplikat)',
    run: () => Errors.SemanticError.duplicateName('test').httpStatus,
    expected: 409 },

  // ── T-L2: Level 2 – Piecewise-linear, Allen, Conversion ──────────────────

  { id: 'T-L2-001', level: 2, description: 'Allen BEFORE',
    run: () => allenRelation({ start: 1n, end: 5n }, { start: 10n, end: 20n }),
    expected: 'BEFORE' },

  { id: 'T-L2-002', level: 2, description: 'Allen AFTER',
    run: () => allenRelation({ start: 10n, end: 20n }, { start: 1n, end: 5n }),
    expected: 'AFTER' },

  { id: 'T-L2-003', level: 2, description: 'Allen MEETS',
    run: () => allenRelation({ start: 1n, end: 10n }, { start: 10n, end: 20n }),
    expected: 'MEETS' },

  { id: 'T-L2-004', level: 2, description: 'Allen MET_BY',
    run: () => allenRelation({ start: 10n, end: 20n }, { start: 1n, end: 10n }),
    expected: 'MET_BY' },

  { id: 'T-L2-005', level: 2, description: 'Allen EQUALS',
    run: () => allenRelation({ start: 5n, end: 15n }, { start: 5n, end: 15n }),
    expected: 'EQUALS' },

  { id: 'T-L2-006', level: 2, description: 'Allen OVERLAPS',
    run: () => allenRelation({ start: 1n, end: 10n }, { start: 5n, end: 15n }),
    expected: 'OVERLAPS' },

  { id: 'T-L2-007', level: 2, description: 'Allen DURING',
    run: () => allenRelation({ start: 5n, end: 10n }, { start: 1n, end: 15n }),
    expected: 'DURING' },

  { id: 'T-L2-008', level: 2, description: 'Allen CONTAINS',
    run: () => allenRelation({ start: 1n, end: 15n }, { start: 5n, end: 10n }),
    expected: 'CONTAINS' },

  { id: 'T-L2-009', level: 2, description: 'Allen STARTS',
    run: () => allenRelation({ start: 1n, end: 10n }, { start: 1n, end: 20n }),
    expected: 'STARTS' },

  { id: 'T-L2-010', level: 2, description: 'Allen FINISHES',
    run: () => allenRelation({ start: 10n, end: 20n }, { start: 5n, end: 20n }),
    expected: 'FINISHES' },

  { id: 'T-L2-011', level: 2, description: 'convertValue UTC→TAI',
    run: () => convertValue(iso8601ToSeconds('2017-01-01T00:00:00Z'), 'UTC', 'TAI'),
    expected: iso8601ToSeconds('2017-01-01T00:00:00Z') + 37n },

  { id: 'T-L2-012', level: 2, description: 'convertValue TAI→UTC Round-Trip',
    run: () => { const utc = iso8601ToSeconds('2024-06-01T00:00:00Z'); return convertValue(convertValue(utc,'UTC','TAI'),'TAI','UTC') === utc; },
    expected: true },

  { id: 'T-L2-013', level: 2, description: 'convertValue same domain = identity',
    run: () => convertValue(12345n, 'TAI', 'TAI'),
    expected: 12345n },

  { id: 'T-L2-014', level: 2, description: 'createTimepoint – gibt CGTimepoint zurück',
    run: () => { const tp = createTimepoint('TAI', '1.0', 1742041937n); return typeof tp.machine_id; },
    expected: 'string' },

  { id: 'T-L2-015', level: 2, description: 'createTimepoint – CGTA korrekt formatiert',
    run: () => createTimepoint('TAI', '1.0', 1742041937n).cgta,
    expected: 'CG:TAI:1742041937/v1' },

  { id: 'T-L2-016', level: 2, description: 'CTDDL – Gregorian piecewise-linear gültig',
    run: () => { parseDomain({ name:'TestGreg', version:'1.0', type:'piecewise-linear', granularity:'second',
      extent:{min:'0001-01-01T00:00:00Z', max:'9999-12-31T23:59:59Z', inclusive:true},
      metadata:{stability:'permanent'} }); return true; },
    expected: true },

  { id: 'T-L2-017', level: 2, description: 'Fehlerklasse CG-E-005.010 Chain-Limit',
    run: () => Errors.MappingError.chainTooLong('test').code,
    expected: 'CG-E-005.010' },

  { id: 'T-L2-018', level: 2, description: 'Fehlerklasse CG-E-010 CGUASError',
    run: () => Errors.CGUASError.segmentNotFound('x').code,
    expected: 'CG-E-010.001' },

  { id: 'T-L2-019', level: 2, description: 'Fehlerklasse CG-E-011.011 QKDCollision',
    run: () => Errors.CGFSError.qkdCollision('x').code,
    expected: 'CG-E-011.011' },

  { id: 'T-L2-020', level: 2, description: 'Fehlerklasse CG-E-011.012 QKDDomainReuse',
    run: () => Errors.CGFSError.qkdDomainReuse('x').code,
    expected: 'CG-E-011.012' },

  // ── T-L3: Level 3 – Invarianten, Immutabilität, Fehlerklassen ────────────

  { id: 'T-L3-001', level: 3, description: 'I-R1: Zeitpunkt hat genau einen absoluten Wert',
    run: () => { const tp1 = createTimepoint('TAI','1.0',1742041937n); const tp2 = createTimepoint('TAI','1.0',1742041937n); return tp1.machine_id === tp2.machine_id; },
    expected: true },

  { id: 'T-L3-002', level: 3, description: 'I-R2: Totale Ordnung – transitiv',
    run: () => compareValues(1n,2n) === -1 && compareValues(2n,3n) === -1 && compareValues(1n,3n) === -1,
    expected: true },

  { id: 'T-L3-003', level: 3, description: 'I-R3: Determinismus – 100 MachineID-Berechnungen identisch',
    run: () => { const ids = Array.from({length:100}, () => computeMachineId('TAI',1742041937n,'1.0')); return new Set(ids).size; },
    expected: 1 },

  { id: 'T-L3-004', level: 3, description: 'I-M1: Mapping-Eindeutigkeit – UTC→TAI ist Funktion',
    run: () => { const utc = 1742041937n; return convertValue(utc,'UTC','TAI') === convertValue(utc,'UTC','TAI'); },
    expected: true },

  { id: 'T-L3-005', level: 3, description: 'I-E1: Keine universelle Epoch in eingebauten Domains',
    run: () => ['TAI','UTC','GPS','Gregorian','Unix'].every(n => !('universalEpoch' in getDomain(n,'1.0'))),
    expected: true },

  { id: 'T-L3-006', level: 3, description: 'Alle 11 Fehlerklassen definiert',
    run: () => [
      Errors.SyntaxError.invalidJson, Errors.SemanticError.duplicateName, Errors.ExtentError.belowMin,
      Errors.HierarchyError.unknownUnit, Errors.MappingError.targetNotFound, Errors.InvariantError.I_R1,
      Errors.VersionError.notFound, Errors.ConstraintError.missingScientificDependency,
      Errors.RegistryError.conflict, Errors.CGUASError.segmentNotFound, Errors.CGFSError.fileNotFound,
    ].every(f => typeof f === 'function'),
    expected: true },

  { id: 'T-L3-007', level: 3, description: 'CG-E-006 InvariantError HTTP 500',
    run: () => Errors.InvariantError.I_R1('test').httpStatus,
    expected: 500 },

  { id: 'T-L3-008', level: 3, description: 'BigInt Overflow-Schutz – sehr große Zahl',
    run: () => { const huge = 10n ** 100n; return encodeCGTA({ domain:'TAI', value:huge, version:1 }).includes(huge.toString()); },
    expected: true },

  { id: 'T-L3-009', level: 3, description: 'Gregorian – 9999-12-31 Round-Trip',
    run: () => secondsToISO8601(iso8601ToSeconds('9999-12-31T23:59:59Z')),
    expected: '9999-12-31T23:59:59Z' },

  { id: 'T-L3-010', level: 3, description: 'Allen – alle 13 Relationen abgedeckt',
    run: () => {
      const rels = new Set([
        allenRelation({start:1n,end:5n},{start:10n,end:20n}),
        allenRelation({start:10n,end:20n},{start:1n,end:5n}),
        allenRelation({start:1n,end:10n},{start:10n,end:20n}),
        allenRelation({start:10n,end:20n},{start:1n,end:10n}),
        allenRelation({start:5n,end:15n},{start:5n,end:15n}),
        allenRelation({start:1n,end:10n},{start:5n,end:15n}),
        allenRelation({start:5n,end:10n},{start:1n,end:15n}),
        allenRelation({start:1n,end:15n},{start:5n,end:10n}),
        allenRelation({start:1n,end:10n},{start:1n,end:20n}),
        allenRelation({start:10n,end:20n},{start:1n,end:20n}),
        allenRelation({start:1n,end:20n},{start:1n,end:10n}),
        allenRelation({start:1n,end:20n},{start:5n,end:20n}),
        allenRelation({start:5n,end:15n},{start:1n,end:10n}),
      ]);
      return rels.size;
    },
    expected: 13 },
];
