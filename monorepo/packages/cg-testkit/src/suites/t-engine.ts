import type{TestCase}from'../runner.js';
import{parseDomain}from'cg-ctddl/parser.js';
import{encodeCGTA,decodeCGTA,computeMachineId,computeCGFI,createTimepoint,allenRelation,compareValues,verifyDeterminism,convertValue,getDomain,listDomainKeys,nowTaiNs}from'cg-engine/engine.js';
import{isLeapYear,daysInMonth,gregorianToSeconds,secondsToISO8601,iso8601ToSeconds}from'cg-engine/gregorian.js';
import{utcToTai,taiToUtc,gpsToTai,taiToGps,taiMinusUtcAt,CURRENT_TAI_MINUS_UTC}from'cg-engine/mapping.js';
import{rat}from'cg-engine/exakt.js';
import{Errors}from'cg-types/errors.js';
export const engineTests:TestCase[]=[
  {id:'T-L1-001',level:1,description:'CGTA encode TAI',run:()=>encodeCGTA({domain:'TAI',value:1742041937n,version:1}),expected:'CG:TAI:1742041937/v1'},
  {id:'T-L1-002',level:1,description:'CGTA decode domain',run:()=>decodeCGTA('CG:TAI:1742041937/v1').domain,expected:'TAI'},
  {id:'T-L1-003',level:1,description:'CGTA decode BigInt',run:()=>typeof decodeCGTA('CG:TAI:1742041937/v1').value,expected:'bigint'},
  {id:'T-L1-004',level:1,description:'CGTA negativ',run:()=>encodeCGTA({domain:'Unix',value:-2147483648n,version:1}),expected:'CG:Unix:-2147483648/v1'},
  {id:'T-L1-005',level:1,description:'MachineID Determinismus',run:()=>computeMachineId('TAI',1742041937n,'1.0')===computeMachineId('TAI',1742041937n,'1.0'),expected:true},
  {id:'T-L1-006',level:1,description:'MachineID verschieden',run:()=>computeMachineId('TAI',1n,'1.0')!==computeMachineId('TAI',2n,'1.0'),expected:true},
  {id:'T-L1-007',level:1,description:'MachineID 64 Zeichen',run:()=>computeMachineId('TAI',1742041937n,'1.0').length,expected:64},
  {id:'T-L1-008',level:1,description:'CGFI 64 Zeichen',run:()=>computeCGFI('a','b','c').length,expected:64},
  {id:'T-L1-009',level:1,description:'CGFI Determinismus',run:()=>computeCGFI('a','b','c')===computeCGFI('a','b','c'),expected:true},
  {id:'T-L1-010',level:1,description:'CTDDL gültig',run:()=>{parseDomain({name:'T1',version:'1.0',type:'linear',granularity:'second',extent:{min:'0',max:'9999',inclusive:true}});return true;},expected:true},
  {id:'T-L1-011',level:1,description:'CTDDL fehlendes Feld',run:()=>{try{parseDomain({name:'X',version:'1.0'});return false;}catch(e){return(e as{code:string}).code.startsWith('CG-E-001');}},expected:true},
  {id:'T-L1-012',level:1,description:'CTDDL ungültiger Typ',run:()=>{try{parseDomain({name:'X',version:'1.0',type:'bad',granularity:'second',extent:{min:0,max:1,inclusive:true}});return false;}catch(e){return(e as{code:string}).code==='CG-E-001.004';}},expected:true},
  {id:'T-L1-013',level:1,description:'BigInt kleiner',run:()=>compareValues(100n,200n),expected:-1},
  {id:'T-L1-014',level:1,description:'BigInt gleich',run:()=>compareValues(42n,42n),expected:0},
  {id:'T-L1-015',level:1,description:'BigInt größer',run:()=>compareValues(200n,100n),expected:1},
  {id:'T-L1-016',level:1,description:'Schaltjahr 2000',run:()=>isLeapYear(2000n),expected:true},
  {id:'T-L1-017',level:1,description:'Kein Schaltjahr 1900',run:()=>isLeapYear(1900n),expected:false},
  {id:'T-L1-018',level:1,description:'Schaltjahr 2024',run:()=>isLeapYear(2024n),expected:true},
  {id:'T-L1-019',level:1,description:'Kein Schaltjahr 2023',run:()=>isLeapYear(2023n),expected:false},
  {id:'T-L1-020',level:1,description:'Feb Schaltjahr 29 Tage',run:()=>daysInMonth(2024n,2n),expected:29n},
  {id:'T-L1-021',level:1,description:'Feb Normal 28 Tage',run:()=>daysInMonth(2023n,2n),expected:28n},
  {id:'T-L1-022',level:1,description:'Epoch = 0',run:()=>gregorianToSeconds(1n,1n,1n),expected:0n},
  {id:'T-L1-023',level:1,description:'ISO8601 Round-Trip',run:()=>secondsToISO8601(iso8601ToSeconds('2024-01-15T12:00:00Z')),expected:'2024-01-15T12:00:00Z'},
  {id:'T-L1-024',level:1,description:'TAI-UTC 2017 +37',run:()=>utcToTai(iso8601ToSeconds('2017-01-01T00:00:00Z'))-iso8601ToSeconds('2017-01-01T00:00:00Z'),expected:37n},
  {id:'T-L1-025',level:1,description:'CURRENT_TAI_MINUS_UTC=37',run:()=>CURRENT_TAI_MINUS_UTC,expected:37n},
  {id:'T-L1-026',level:1,description:'GPS Round-Trip',run:()=>taiToGps(gpsToTai(1000000n))===1000000n,expected:true},
  {id:'T-L1-027',level:1,description:'TAI registriert',run:()=>{try{getDomain('TAI','1.0');return true;}catch{return false;}},expected:true},
  {id:'T-L1-028',level:1,description:'UTC registriert',run:()=>{try{getDomain('UTC','1.0');return true;}catch{return false;}},expected:true},
  {id:'T-L1-029',level:1,description:'GPS registriert',run:()=>{try{getDomain('GPS','1.0');return true;}catch{return false;}},expected:true},
  {id:'T-L1-030',level:1,description:'Gregorian registriert',run:()=>{try{getDomain('Gregorian','1.0');return true;}catch{return false;}},expected:true},
  {id:'T-L1-031',level:1,description:'Unix registriert',run:()=>{try{getDomain('Unix','1.0');return true;}catch{return false;}},expected:true},
  {id:'T-L1-032',level:1,description:'Cosmic registriert',run:()=>{try{getDomain('Cosmic','1.1');return true;}catch{return false;}},expected:true},
  {id:'T-L1-033',level:1,description:'Unbekannte Domain',run:()=>{try{getDomain('X','1.0');return false;}catch(e){return(e as{code:string}).code==='CG-E-007.001';}},expected:true},
  {id:'T-L1-034',level:1,description:'CGTA ungültig',run:()=>{try{decodeCGTA('BAD');return false;}catch(e){return(e as{code:string}).code==='CG-E-001.007';}},expected:true},
  {id:'T-L1-035',level:1,description:'verifyDeterminism',run:()=>verifyDeterminism('TAI',1742041937n,'1.0'),expected:true},
  {id:'T-L1-036',level:1,description:'semantics=time',run:()=>getDomain('TAI','1.0').semantics??'time',expected:'time'},
  {id:'T-L1-037',level:1,description:'sci_dep bei stability=low',run:()=>{try{parseDomain({name:'X2',version:'1.0',type:'linear',granularity:'second',extent:{min:0,max:1,inclusive:true},metadata:{stability:'low'}});return false;}catch(e){return(e as{code:string}).code==='CG-E-008.001';}},expected:true},
  {id:'T-L1-038',level:1,description:'Cosmic hat sci_dep',run:()=>!!(getDomain('Cosmic','1.1').metadata?.scientific_dependency),expected:true},
  {id:'T-L1-039',level:1,description:'TAI-UTC Round-Trip',run:()=>{const u=iso8601ToSeconds('2024-03-15T10:00:00Z');return taiToUtc(utcToTai(u))===u;},expected:true},
  {id:'T-L1-040',level:1,description:'Name mit Leerzeichen → Fehler',run:()=>{try{parseDomain({name:'my domain',version:'1.0',type:'linear',granularity:'second',extent:{min:0,max:1,inclusive:true}});return false;}catch{return true;}},expected:true},
  {id:'T-L1-041',level:1,description:'Chain>8 → CG-E-005.010',run:()=>{try{parseDomain({name:'C',version:'1.0',type:'linear',granularity:'second',extent:{min:0,max:1,inclusive:true},mapping:Array(9).fill({targetDomain:'TAI',targetVersion:'1.0',type:'linear',refPoints:[]})});return false;}catch(e){return(e as{code:string}).code==='CG-E-005.010';}},expected:true},
  {id:'T-L1-042',level:1,description:'Fehler hat code+class+severity',run:()=>{const e=Errors.SyntaxError.invalidJson('t');return!!(e.code&&e.cgClass&&e.severity);},expected:true},
  {id:'T-L1-043',level:1,description:'CG-E-001 HTTP 422',run:()=>Errors.SyntaxError.invalidJson('t').httpStatus,expected:422},
  {id:'T-L1-044',level:1,description:'CG-E-007.001 HTTP 404',run:()=>Errors.VersionError.notFound('t').httpStatus,expected:404},
  {id:'T-L1-045',level:1,description:'I-E1: keine universale Epoch',run:()=>!('epoch' in getDomain('TAI','1.0')),expected:true},
  {id:'T-L1-046',level:1,description:'April 30 Tage',run:()=>daysInMonth(2024n,4n),expected:30n},
  {id:'T-L1-047',level:1,description:'CGTA negativ decode',run:()=>decodeCGTA('CG:Unix:-2147483648/v1').value,expected:-2147483648n},
  {id:'T-L1-048',level:1,description:'MachineID domain-sensitiv',run:()=>computeMachineId('TAI',1n,'1.0')!==computeMachineId('UTC',1n,'1.0'),expected:true},
  {id:'T-L1-049',level:1,description:'CGFI type-sensitiv',run:()=>computeCGFI('a','b','pdf')!==computeCGFI('a','b','json'),expected:true},
  {id:'T-L1-050',level:1,description:'nowTaiNs BigInt',run:()=>typeof nowTaiNs(),expected:'bigint'},
  {id:'T-L1-051',level:1,description:'nowTaiNs>0',run:()=>nowTaiNs()>0n,expected:true},
  {id:'T-L1-052',level:1,description:'TAI@1.0 in keys',run:()=>listDomainKeys().includes('TAI@1.0'),expected:true},
  {id:'T-L1-053',level:1,description:'2024-02-29 Round-Trip',run:()=>secondsToISO8601(iso8601ToSeconds('2024-02-29T00:00:00Z')),expected:'2024-02-29T00:00:00Z'},
  {id:'T-L1-054',level:1,description:'CG-E-003 HTTP 422',run:()=>Errors.ExtentError.belowMin('t').httpStatus,expected:422},
  {id:'T-L1-055',level:1,description:'CG-E-002.001 HTTP 409',run:()=>Errors.SemanticError.duplicateName('t').httpStatus,expected:409},
  {id:'T-L1-056',level:1,description:'MachineID version-sensitiv',run:()=>computeMachineId('TAI',0n,'1.0')!==computeMachineId('TAI',0n,'2.0'),expected:true},
  {id:'T-L1-057',level:1,description:'MachineID Golden Vector',run:()=>computeMachineId('TAI',0n,'1.0'),expected:'f060329799216feb80f3561f8aeff77b64531737ea1da8624c391975b9ce89da'},
  {id:'T-L1-058',level:1,description:'Domain-Kategorie reist mit Domain',run:()=>computeMachineId('CGUAS',100n,'1.0')!==computeMachineId('TAI',100n,'1.0'),expected:true},
  {id:'T-L1-059',level:1,description:'MachineID lehnt :-Injection ab',run:()=>{try{computeMachineId('TA:I',0n,'1.0');return'no-throw';}catch{return'throw';}},expected:'throw'},
  // ── Portiert aus t-eng.ts (Schritt 2) — dort nie ausgeführt, API-Aufrufe neu geschrieben ──
  // T-L1-060 (ex T-ENG-036): der Sprung selbst, nicht nur ein Tabellenwert. T-L1-024 und
  // T-L3-012 belegen 37 s bzw. 10 s, aber keine Schaltsekunde. Offset ≠ Schaltsekundenzahl
  // (CG-STD-3100 §5.1) — genau die Verwechslung aus 7997bdc.
  {id:'T-L1-060',level:1,description:'Schaltsekunde 1972-07-01: Offset springt 10→11',run:()=>`${taiMinusUtcAt(iso8601ToSeconds('1972-06-30T00:00:00Z'))}->${taiMinusUtcAt(iso8601ToSeconds('1972-07-01T00:00:00Z'))}`,expected:'10->11'},
  // T-L1-061 (ex T-ENG-034): geprüft wird die Differenz zur GPS-Epoche, nicht gpsToTai(0)
  // selbst — der Absolutwert 62451561619 würde die Epochenlage mitprüfen und bei einer
  // falschen Konstante TAI_GPS trotzdem grün bleiben, solange die Epoche mitwandert.
  // Die Vorlage rief gpsNsToTaiNs() auf der ns-Skala auf; die gibt es nicht.
  {id:'T-L1-061',level:1,description:'GPS→TAI-Offset 19 s (Differenz zur GPS-Epoche)',run:()=>`${gpsToTai(0n)-iso8601ToSeconds('1980-01-06T00:00:00Z')}`,expected:'19'},
  // T-L1-062 (ex T-ENG-012): Absolutvektor statt Roundtrip. T-L1-023/053 und T-L3-009 sind
  // Roundtrips und damit invariant gegen einen konsistenten Versatz beider Richtungen;
  // T-L1-022 verankert nur (1,1,1)=0, was auch eine fehlerhafte 400-Jahres-Regel erfüllt.
  // Linke Hälfte: Tagesarithmetik 2023 Jahre nach der Epoche. Rechte Hälfte: derselbe Tag
  // über den ISO-Pfad mit Tageszeit; die Differenz 55800 s = 15:30 prüft deren Durchreichung.
  // Die Vorlage rief encodeGregorian() mit vollem Struct auf; die Funktion gibt es nicht.
  {id:'T-L1-062',level:1,description:'Absolutvektor 2024-04-23 (Datum | Datum+15:30 UTC)',run:()=>`${gregorianToSeconds(2024n,4n,23n)}/${iso8601ToSeconds('2024-04-23T15:30:00Z')}`,expected:'63849427200/63849483000'},
  {id:'T-L2-001',level:2,description:'Allen BEFORE',run:()=>allenRelation({start:1n,end:5n},{start:10n,end:20n}),expected:'BEFORE'},
  {id:'T-L2-002',level:2,description:'Allen AFTER',run:()=>allenRelation({start:10n,end:20n},{start:1n,end:5n}),expected:'AFTER'},
  {id:'T-L2-003',level:2,description:'Allen MEETS',run:()=>allenRelation({start:1n,end:10n},{start:10n,end:20n}),expected:'MEETS'},
  {id:'T-L2-004',level:2,description:'Allen MET_BY',run:()=>allenRelation({start:10n,end:20n},{start:1n,end:10n}),expected:'MET_BY'},
  {id:'T-L2-005',level:2,description:'Allen EQUALS',run:()=>allenRelation({start:5n,end:15n},{start:5n,end:15n}),expected:'EQUALS'},
  {id:'T-L2-006',level:2,description:'Allen OVERLAPS',run:()=>allenRelation({start:1n,end:10n},{start:5n,end:15n}),expected:'OVERLAPS'},
  {id:'T-L2-007',level:2,description:'Allen DURING',run:()=>allenRelation({start:5n,end:10n},{start:1n,end:15n}),expected:'DURING'},
  {id:'T-L2-008',level:2,description:'Allen CONTAINS',run:()=>allenRelation({start:1n,end:15n},{start:5n,end:10n}),expected:'CONTAINS'},
  {id:'T-L2-009',level:2,description:'Allen STARTS',run:()=>allenRelation({start:1n,end:10n},{start:1n,end:20n}),expected:'STARTS'},
  {id:'T-L2-010',level:2,description:'Allen FINISHES',run:()=>allenRelation({start:10n,end:20n},{start:5n,end:20n}),expected:'FINISHES'},
  {id:'T-L2-011',level:2,description:'convertValue UTC→TAI',run:()=>convertValue(iso8601ToSeconds('2017-01-01T00:00:00Z'),'UTC','TAI'),expected:iso8601ToSeconds('2017-01-01T00:00:00Z')+37n},
  {id:'T-L2-012',level:2,description:'convertValue Round-Trip',run:()=>{const u=iso8601ToSeconds('2024-06-01T00:00:00Z');return convertValue(convertValue(u,'UTC','TAI'),'TAI','UTC')===u;},expected:true},
  {id:'T-L2-013',level:2,description:'convertValue identity',run:()=>convertValue(12345n,'TAI','TAI'),expected:12345n},
  {id:'T-L2-014',level:2,description:'createTimepoint machine_id',run:()=>typeof createTimepoint('TAI','1.0',1742041937n).machine_id,expected:'string'},
  {id:'T-L2-015',level:2,description:'createTimepoint CGTA',run:()=>createTimepoint('TAI','1.0',1742041937n).cgta,expected:'CG:TAI:1742041937/v1'},
  {id:'T-L2-016',level:2,description:'piecewise-linear gültig',run:()=>{parseDomain({name:'TG',version:'1.0',type:'piecewise-linear',granularity:'second',extent:{min:'0001-01-01T00:00:00Z',max:'9999-12-31T23:59:59Z',inclusive:true},metadata:{stability:'permanent'}});return true;},expected:true},
  {id:'T-L2-017',level:2,description:'CG-E-005.010',run:()=>Errors.MappingError.chainTooLong('t').code,expected:'CG-E-005.010'},
  {id:'T-L2-018',level:2,description:'CG-E-010.001',run:()=>Errors.CGUASError.segmentNotFound('x').code,expected:'CG-E-010.001'},
  {id:'T-L2-019',level:2,description:'CG-E-011.011 QKDCollision',run:()=>Errors.CGFSError.qkdCollision('x').code,expected:'CG-E-011.011'},
  {id:'T-L2-020',level:2,description:'CG-E-011.012 QKDDomainReuse',run:()=>Errors.CGFSError.qkdDomainReuse('x').code,expected:'CG-E-011.012'},
  // T-L2-021/022 (ex T-ENG-053/054): anders als T-L2-017..020, die nur die Fehlerfabrik
  // abfragen, laufen diese beiden gegen echte Wurfstellen — engine.ts:22 bzw. exakt.ts:54.
  // Der 'no-throw'-Zweig belegt die Gegenrichtung (vgl. T-L1-059).
  {id:'T-L2-021',level:2,description:'convertValue unbekanntes Domain-Paar wirft CG-E-005.001',run:()=>{try{convertValue(1n,'TAI','Cosmic');return'no-throw';}catch(e){return(e as{code:string}).code;}},expected:'CG-E-005.001'},
  {id:'T-L2-022',level:2,description:'rat() mit Nenner 0 wirft CG-E-005.007',run:()=>{try{rat(1n,0n);return'no-throw';}catch(e){return(e as{code:string}).code;}},expected:'CG-E-005.007'},
  // T-L2-023 ist KEINE Portierung von T-ENG-013 — dieser Sachverhalt (decodeGregorian(62135596800)
  // == 1970-01-01) waere nach T-L1-022 und T-L1-062 nur eine dritte Stuetzstelle derselben
  // Tagesarithmetik; T-ENG-013 und die Dublette T-ENG-030 entfallen ersatzlos. Neu ist der Fall
  // am selben Zahlenwert: convertValue mit 'Unix' als Quelle war nie ausgefuehrt, engine.ts:20
  // und :21 sind unberuehrter Produktivcode, und 62135596800 ist dort die Epochenkonstante.
  // Die zweite Zusicherung liegt bewusst auf 2017 statt auf der Epoche: bei Unix 0 laege der
  // Bezugspunkt vor 1972, wo taiMinusUtcAt still 0n liefert statt abzulehnen — ein Fall dort
  // wuerde dieses Fehlverhalten als Erwartung festschreiben.
  {id:'T-L2-023',level:2,description:'convertValue Unix→UTC Epochenkonstante | Unix→TAI Schaltsekunden 2017',run:()=>`${convertValue(0n,'Unix','UTC')}/${convertValue(1483228800n,'Unix','TAI')-convertValue(1483228800n,'Unix','UTC')}`,expected:'62135596800/37'},
  {id:'T-L3-001',level:3,description:'I-R1: eindeutiger Zeitwert',run:()=>{const a=createTimepoint('TAI','1.0',1742041937n),b=createTimepoint('TAI','1.0',1742041937n);return a.machine_id===b.machine_id;},expected:true},
  {id:'T-L3-002',level:3,description:'I-R2: transitiv',run:()=>compareValues(1n,2n)===-1&&compareValues(2n,3n)===-1&&compareValues(1n,3n)===-1,expected:true},
  {id:'T-L3-003',level:3,description:'I-R3: 100× identisch',run:()=>new Set(Array.from({length:100},()=>computeMachineId('TAI',1742041937n,'1.0'))).size,expected:1},
  {id:'T-L3-004',level:3,description:'I-M1: Mapping ist Funktion',run:()=>{const u=1742041937n;return convertValue(u,'UTC','TAI')===convertValue(u,'UTC','TAI');},expected:true},
  {id:'T-L3-005',level:3,description:'I-E1: keine universale Epoch',run:()=>['TAI','UTC','GPS','Gregorian','Unix'].every(n=>!('universalEpoch' in getDomain(n,'1.0'))),expected:true},
  {id:'T-L3-006',level:3,description:'12 Fehlerklassen (inkl. Auth)',run:()=>[Errors.SyntaxError.invalidJson,Errors.SemanticError.duplicateName,Errors.ExtentError.belowMin,Errors.HierarchyError.unknownUnit,Errors.MappingError.targetNotFound,Errors.InvariantError.I_R1,Errors.VersionError.notFound,Errors.ConstraintError.missingScientificDependency,Errors.RegistryError.conflict,Errors.CGUASError.segmentNotFound,Errors.CGFSError.fileNotFound,Errors.AuthError.unauthorized].every(f=>typeof f==='function'),expected:true},
  {id:'T-L3-007',level:3,description:'CG-E-006 HTTP 500',run:()=>Errors.InvariantError.I_R1('t').httpStatus,expected:500},
  {id:'T-L3-008',level:3,description:'BigInt 10^100 in CGTA',run:()=>{const h=10n**100n;return encodeCGTA({domain:'TAI',value:h,version:1}).includes(h.toString());},expected:true},
  {id:'T-L3-009',level:3,description:'9999-12-31 Round-Trip',run:()=>secondsToISO8601(iso8601ToSeconds('9999-12-31T23:59:59Z')),expected:'9999-12-31T23:59:59Z'},
  {id:'T-L3-010',level:3,description:'Allen 13 Relationen',run:()=>new Set([allenRelation({start:1n,end:5n},{start:10n,end:20n}),allenRelation({start:10n,end:20n},{start:1n,end:5n}),allenRelation({start:1n,end:10n},{start:10n,end:20n}),allenRelation({start:10n,end:20n},{start:1n,end:10n}),allenRelation({start:5n,end:15n},{start:5n,end:15n}),allenRelation({start:1n,end:10n},{start:5n,end:15n}),allenRelation({start:5n,end:10n},{start:1n,end:15n}),allenRelation({start:1n,end:15n},{start:5n,end:10n}),allenRelation({start:1n,end:10n},{start:1n,end:20n}),allenRelation({start:10n,end:20n},{start:5n,end:20n}),allenRelation({start:1n,end:20n},{start:1n,end:10n}),allenRelation({start:1n,end:20n},{start:5n,end:20n}),allenRelation({start:5n,end:15n},{start:1n,end:10n})]).size,expected:13},
  // ── AP-11.2a: L3-A Restlücken ────────────────────────────────────────────
  // T-L3-011/012: I-M3 Referenzpunkt-Konsistenz (CG-STD-0000 Theorem 3.3)
  // T-L3-013:     I-SEG-1 Segment-Isolation (CG-STD-0000 Theorem 5.5)
  // T-L3-014:     BigInt-Pflicht kein Number-Fallback (CG-STD-3100 Kap. 2.6)
  {id:'T-L3-011',level:3,description:'I-M3: Referenzpunkt-Konsistenz — Unix→TAI→GPS→Unix Roundtrip exakt (CG-STD-0000 Anhang A)',run:()=>{const t_unix=iso8601ToSeconds('2023-05-01T00:00:00Z');const t_tai=convertValue(t_unix,'UTC','TAI');const t_gps=taiToGps(t_tai);const t_back=convertValue(gpsToTai(t_gps),'TAI','UTC');return t_back===t_unix;},expected:true},
  {id:'T-L3-012',level:3,description:'I-M3: Referenzpunkt-Konsistenz — UTC 1972-01-01T00:00:00Z → TAI Offset exakt 10s (normatives Referenzpaar)',run:()=>{const utc_s=iso8601ToSeconds('1972-01-01T00:00:00Z');const tai_s=convertValue(utc_s,'UTC','TAI');return tai_s-utc_s===10n;},expected:true},
  {id:'T-L3-013',level:3,description:'I-SEG-1: Segment-Isolation — op(Segment A) verändert Zustand von Segment B nicht (CG-STD-0000 Theorem 5.5)',run:async()=>{const{InMemorySegmentRepository}=await import('cg-storage/repository.js');const repo=new InMemorySegmentRepository();const segA=await repo.allocate('owner-A',1_000_000_000n);const segB=await repo.allocate('owner-B',2_000_000_000n);const beforeB=await repo.resolve(segB.id);await repo.revoke(segA.id);const afterB=await repo.resolve(segB.id);return afterB.status===beforeB.status&&afterB.id===beforeB.id;},expected:true},
  {id:'T-L3-014',level:3,description:'Kein Number-Fallback: 2^53+1 in CGTA exakt dargestellt — BigInt-Pflicht (CG-STD-3100 Kap. 2.6)',run:()=>{const exact=2n**53n+1n;const cgta=encodeCGTA({domain:'TAI',value:exact,version:1});const decoded=decodeCGTA(cgta);return typeof decoded.value==='bigint'&&decoded.value===exact;},expected:true},
];
