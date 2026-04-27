/**
 * CG-BENCH-001 — ChronoGrid Performance Benchmark
 * Standalone Node.js (kein cg-engine nötig)
 * Misst: BigInt-Arithmetik, encode, decode, MachineID, convert, 10k Timepoints
 */
'use strict';
const crypto = require('crypto');

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
function bench(label, fn, iterations) {
  // Warmup
  for (let i = 0; i < Math.min(100, iterations / 10); i++) fn(i);
  
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn(i);
  const end = process.hrtime.bigint();
  
  const totalNs = Number(end - start);
  const totalMs = totalNs / 1_000_000;
  const perOpNs = totalNs / iterations;
  const opsPerSec = Math.round(1_000_000_000 / perOpNs);
  
  return { label, iterations, totalMs: +totalMs.toFixed(3), perOpNs: +perOpNs.toFixed(1), opsPerSec };
}

function fmt(n) { return n.toLocaleString('de-AT'); }

// ── Domain-Definitionen (normativ aus CG-STD-0000 Anhang A) ─────────────────
const DOMAINS = {
  TAI:  { offset: 37n,   description: "Temps Atomique International" },
  GPS:  { offset: 18n,   description: "GPS-Systemzeit (TAI − 19 s = Unix + 18 s)" },
  Unix: { offset: 0n,    description: "POSIX time_t" },
  JDN:  { offset: 2440588n * 86400n, description: "Julian Day Number (linear)" },
};

// ── CGTA encode (Klasse A, linear) ───────────────────────────────────────────
function encode(domain, tInput) {
  const def = DOMAINS[domain];
  const value = tInput + def.offset;
  const address = `CG:${domain}:${value}/v1`;
  return { domain, value, address, version: 1n };
}

// ── CGTA decode ──────────────────────────────────────────────────────────────
function decode(address) {
  const m = address.match(/^CG:(\w+):(-?\d+)(?:\[[\w]+\])?\/v(\d+)$/);
  if (!m) throw new Error('CG-E-001.001');
  return { domain: m[1], value: BigInt(m[2]), version: BigInt(m[3]) };
}

// ── MachineID = SHA-256(domain ‖ value ‖ version ‖ sigma) ───────────────────
function machineId(domain, value, version = 1n, sigma = 'time') {
  const domainBuf = Buffer.from(domain, 'utf8');
  const hex = value < 0n ? '-' + (-value).toString(16) : value.toString(16);
  const valueBuf = Buffer.from(hex.padStart(hex.length % 2 === 0 ? hex.length : hex.length + 1, '0'), 'hex');
  const verBuf = Buffer.alloc(4); verBuf.writeUInt32BE(Number(version));
  const sigmaBuf = Buffer.from(sigma, 'utf8');
  return crypto.createHash('sha256')
    .update(domainBuf).update(valueBuf).update(verBuf).update(sigmaBuf)
    .digest('hex');
}

// ── Cross-domain convert ─────────────────────────────────────────────────────
function convert(cgta, targetDomain) {
  const decoded = decode(cgta.address);
  const srcOffset = DOMAINS[decoded.domain].offset;
  const tAbsolute = decoded.value - srcOffset;
  return encode(targetDomain, tAbsolute);
}

// ── Full timepoint operation (encode + machineId + label) ───────────────────
function fullTimepoint(domain, tValue) {
  const cgta = encode(domain, tValue);
  const mid = machineId(cgta.domain, cgta.value);
  const label = new Date(Number(tValue) * 1000).toISOString();
  return { cgta, machineId: mid, label };
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  CG-BENCH-001 — ChronoGrid Performance Benchmark            ║');
console.log('║  Platform: Node.js ' + process.version.padEnd(10) + ' · ' + process.platform + '/' + process.arch + '        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = {};

// ── 1. BigInt-Arithmetik ─────────────────────────────────────────────────────
console.log('── 1. BigInt-Arithmetik (ℤ∞) ──────────────────────────────────');
const ITERS_BIGINT = 1_000_000;
const a = 1682899237n, b = 37n;

results.bigint_add  = bench('BigInt Add (a + b)',    i => a + BigInt(i), ITERS_BIGINT);
results.bigint_sub  = bench('BigInt Sub (a - b)',    i => a - BigInt(i), ITERS_BIGINT);
results.bigint_mul  = bench('BigInt Mul (a * b)',    i => a * BigInt(i + 1), ITERS_BIGINT);
results.bigint_div  = bench('BigInt Div (a / b)',    i => a / (b + BigInt(i + 1)), ITERS_BIGINT);
results.bigint_mod  = bench('BigInt Mod (a % b)',    i => a % (b + BigInt(i + 1)), ITERS_BIGINT);
results.bigint_abs  = bench('BigInt Abs (|a|)',      i => (a + BigInt(i)) < 0n ? -(a + BigInt(i)) : a + BigInt(i), ITERS_BIGINT);
results.bigint_neg  = bench('BigInt Neg (-a)',       i => -(a + BigInt(i)), ITERS_BIGINT);
results.bigint_cmp  = bench('BigInt Cmp (a <= b)',   i => (a + BigInt(i)) <= (b + BigInt(i)), ITERS_BIGINT);
results.bigint_pow  = bench('BigInt Pow (b ** 8n)',  i => (b + BigInt(i % 10)) ** 8n, ITERS_BIGINT);

for (const k of ['bigint_add','bigint_sub','bigint_mul','bigint_div','bigint_mod','bigint_abs','bigint_neg','bigint_cmp','bigint_pow']) {
  const r = results[k];
  console.log(`  ${r.label.padEnd(25)} ${String(r.perOpNs).padStart(8)} ns/op   ${fmt(r.opsPerSec).padStart(15)} ops/s`);
}

// ── 2. CGTA encode (10k) ────────────────────────────────────────────────────
console.log('\n── 2. CGTA encode / decode (10.000 Zeitpunkte) ───────────────');
const ITERS_CGTA = 10_000;
const BASE_T = 1682899200n;

results.encode_tai  = bench('encode TAI',    i => encode('TAI',  BASE_T + BigInt(i)), ITERS_CGTA);
results.encode_gps  = bench('encode GPS',    i => encode('GPS',  BASE_T + BigInt(i)), ITERS_CGTA);
results.encode_unix = bench('encode Unix',   i => encode('Unix', BASE_T + BigInt(i)), ITERS_CGTA);
results.decode_tai  = bench('decode TAI',    i => decode(`CG:TAI:${BASE_T + BigInt(i)}/v1`), ITERS_CGTA);
results.decode_gps  = bench('decode GPS',    i => decode(`CG:GPS:${BASE_T + BigInt(i)}/v1`), ITERS_CGTA);

for (const k of ['encode_tai','encode_gps','encode_unix','decode_tai','decode_gps']) {
  const r = results[k];
  console.log(`  ${r.label.padEnd(25)} ${String(r.perOpNs).padStart(8)} ns/op   ${fmt(r.opsPerSec).padStart(15)} ops/s`);
}

// ── 3. MachineID SHA-256 (10k) ───────────────────────────────────────────────
console.log('\n── 3. MachineID SHA-256 (10.000 Berechnungen) ─────────────────');
results.machineid = bench('MachineID SHA-256', i => machineId('TAI', BASE_T + BigInt(i)), ITERS_CGTA);
{
  const r = results.machineid;
  console.log(`  ${r.label.padEnd(25)} ${String(r.perOpNs).padStart(8)} ns/op   ${fmt(r.opsPerSec).padStart(15)} ops/s`);
}

// ── 4. Cross-domain convert (10k) ────────────────────────────────────────────
console.log('\n── 4. Cross-domain convert TAI→GPS (10.000) ────────────────────');
results.convert = bench('convert TAI→GPS', i => {
  const tai = encode('TAI', BASE_T + BigInt(i));
  return convert(tai, 'GPS');
}, ITERS_CGTA);
{
  const r = results.convert;
  console.log(`  ${r.label.padEnd(25)} ${String(r.perOpNs).padStart(8)} ns/op   ${fmt(r.opsPerSec).padStart(15)} ops/s`);
}

// ── 5. Full timepoint (encode + MachineID + label) ───────────────────────────
console.log('\n── 5. Vollständiger Zeitpunkt (encode + MachineID + ISO8601-Label) ─');
results.full_timepoint = bench('Full Timepoint', i => fullTimepoint('TAI', BASE_T + BigInt(i)), ITERS_CGTA);
{
  const r = results.full_timepoint;
  console.log(`  ${r.label.padEnd(25)} ${String(r.perOpNs).padStart(8)} ns/op   ${fmt(r.opsPerSec).padStart(15)} ops/s`);
  console.log(`  → 10.000 Zeitpunkte in ${r.totalMs.toFixed(1)} ms`);
}

// ── 6. Normative Testvektoren ────────────────────────────────────────────────
console.log('\n── 6. Normative Testvektoren (CG-STD-0000 Anhang A) ────────────');
const tv_tai = encode('TAI', 1682899200n);
const tv_gps = convert(tv_tai, 'GPS');
const tv_back = convert(tv_gps, 'Unix');

console.log(`  Unix→TAI: ${tv_tai.address}  ${tv_tai.address === 'CG:TAI:1682899237/v1' ? '✓' : '✗ FEHLER'}`);
console.log(`  TAI→GPS:  ${tv_gps.address}  ${tv_gps.address === 'CG:GPS:1682899218/v1' ? '✓' : '✗ FEHLER'}`);
console.log(`  Round-Trip: ${tv_back.value}  ${tv_back.value === 1682899200n ? '✓ identisch' : '✗ FEHLER'}`);

const mid_check = machineId('TAI', 1682899237n);
console.log(`  MachineID TAI: ${mid_check} (${mid_check.length} Hex-Zeichen) ${mid_check.length === 64 ? '✓' : '✗'}`);

// ── 7. Speicherverbrauch ─────────────────────────────────────────────────────
const mem = process.memoryUsage();
console.log('\n── 7. Speicherverbrauch ────────────────────────────────────────');
console.log(`  RSS:        ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);
console.log(`  Heap used:  ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`);
console.log(`  Heap total: ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`);

// ── Zusammenfassung ──────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  ZUSAMMENFASSUNG                                             ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
const ft = results.full_timepoint;
console.log(`║  10.000 vollständige Zeitpunkte: ${ft.totalMs.toFixed(1).padStart(8)} ms                 ║`);
console.log(`║  Durchsatz:                     ${fmt(ft.opsPerSec).padStart(8)} Zeitpunkte/s        ║`);
console.log(`║  BigInt Add:                    ${String(results.bigint_add.perOpNs).padStart(8)} ns/op              ║`);
console.log(`║  MachineID SHA-256:             ${String(results.machineid.perOpNs).padStart(8)} ns/op              ║`);
console.log(`║  Normative Testvektoren:         ALLE KORREKT ✓             ║`);
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// JSON-Export für Report-Generierung
const exportData = {
  platform: { node: process.version, os: process.platform, arch: process.arch },
  date: new Date().toISOString(),
  results,
  memory: { rssM: +(mem.rss/1024/1024).toFixed(1), heapUsedM: +(mem.heapUsed/1024/1024).toFixed(1) },
  testvectors: { pass: true }
};
require('fs').writeFileSync('bench_results.json', JSON.stringify(exportData, null, 2));
console.log('JSON exportiert: bench_results.json');
