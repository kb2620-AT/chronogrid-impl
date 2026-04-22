/**
 * cg-testkit/src/cli.ts — CG-STD-5100 v1.3 | Sprint 8
 * Engine + Storage + GraphQL + JWT/RBAC + T-API-* HTTP-Integrationstests
 */

import { runTests } from './runner.js';
import { engineTests } from './suites/t-engine.js';
import { storageTests } from './suites/t-storage.js';
import { authTests } from './suites/t-auth.js';
import { apiTests, teardown } from './suites/t-api.js';
import { handleGraphQL } from 'cg-api/graphql.js';
import { signPayload, verifySignature } from 'cg-api/webhooks.js';
import { InMemoryTimepointRepository,InMemoryDomainRepository,InMemoryManifestRepository,InMemoryRelationRepository,InMemorySegmentRepository } from 'cg-storage/repository.js';
import { nowTaiNs } from 'cg-engine/engine.js';
import type { APIContext } from 'cg-api/handlers.js';
import type { TestCase } from './runner.js';

const args  = process.argv.slice(2);
const level = parseInt(args[args.indexOf('--level') + 1] ?? '3', 10) as 1|2|3;
const isJson  = args.includes('--json');

function makeCtx(): APIContext {
  return { timepoints:new InMemoryTimepointRepository(), domains:new InMemoryDomainRepository(), manifests:new InMemoryManifestRepository(), relations:new InMemoryRelationRepository(), segments:new InMemorySegmentRepository(), now:nowTaiNs };
}

type GQL = { data?: Record<string, unknown>; errors?: unknown[] };

const sprint7Tests: TestCase[] = [
  { id:'T-S7-001', level:2, description:'GraphQL health query', run:async()=>((await handleGraphQL('{ health { status } }',undefined,makeCtx())) as GQL).data?.['health'], expected:{status:'ok'} },
  { id:'T-S7-002', level:2, description:'GraphQL allenRelation BEFORE', run:async()=>((await handleGraphQL('{ allenRelation(a_start:"1" a_end:"5" b_start:"10" b_end:"20") }',undefined,makeCtx())) as GQL).data?.['allenRelation'], expected:'BEFORE' },
  { id:'T-S7-003', level:2, description:'GraphQL allenRelation EQUALS', run:async()=>((await handleGraphQL('{ allenRelation(a_start:"5" a_end:"15" b_start:"5" b_end:"15") }',undefined,makeCtx())) as GQL).data?.['allenRelation'], expected:'EQUALS' },
  { id:'T-S7-004', level:2, description:'GraphQL createTimepoint', run:async()=>((await handleGraphQL('mutation { createTimepoint(domain:"TAI",value:"1742041937") { cgta } }',undefined,makeCtx())) as GQL).data?.['createTimepoint'], expected:{cgta:'CG:TAI:1742041937/v1'} },
  { id:'T-S7-005', level:2, description:'GraphQL allocateSegment', run:async()=>((await handleGraphQL('mutation { allocateSegment(granted_by:"t",size_ns:"1000") { status } }',undefined,makeCtx())) as GQL).data?.['allocateSegment'], expected:{status:'active'} },
  { id:'T-S7-006', level:3, description:'GraphQL ungültige Query → errors', run:async()=>Array.isArray(((await handleGraphQL('{ bad }',undefined,makeCtx())) as GQL).errors), expected:true },
  { id:'T-S7-007', level:2, description:'Webhook signPayload sha256= prefix', run:()=>signPayload('s','b').startsWith('sha256='), expected:true },
  { id:'T-S7-008', level:2, description:'Webhook verifySignature korrekt', run:()=>{const b='{"test":true}';return verifySignature('secret',b,signPayload('secret',b));}, expected:true },
  { id:'T-S7-009', level:2, description:'Webhook verifySignature falsch', run:()=>verifySignature('s','b','sha256=bad'), expected:false },
  { id:'T-S7-010', level:2, description:'Webhook Signatur deterministisch', run:()=>signPayload('s','b')===signPayload('s','b'), expected:true },
];

const allTests: TestCase[] = [...engineTests,...storageTests,...sprint7Tests,...authTests,...apiTests];
const filtered = allTests.filter(t=>t.level<=level);

console.log(`\n┌──────────────────────────────────────────────────────────────┐`);
console.log(`│  ChronoGrid Conformance Testkit — CG-STD-5100 v1.3           │`);
console.log(`│  Sprint 8: JWT/RBAC + T-API-* HTTP-Integrationstests         │`);
console.log(`│  Level: ${level} | Tests: ${String(filtered.length).padEnd(4)} von ${allTests.length}                              │`);
console.log(`└──────────────────────────────────────────────────────────────┘\n`);

const results = await runTests(allTests, level);
await teardown();

if (isJson) { console.log(JSON.stringify(results,null,2)); process.exit(results.some(r=>!r.passed)?1:0); }

let passed=0,failed=0;
const byLevel:{[k:number]:{p:number;t:number}}={1:{p:0,t:0},2:{p:0,t:0},3:{p:0,t:0}};

for (const r of results) {
  const c=r.passed?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m';
  console.log(`  ${c} [L${r.level}] ${r.id.padEnd(16)} ${r.description.slice(0,50).padEnd(50)} ${r.durationMs}ms`);
  if(!r.passed&&r.error)console.log(`       └─ ${r.error}`);
  r.passed?passed++:failed++;
  byLevel[r.level]!.t++;
  if(r.passed)byLevel[r.level]!.p++;
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`Tests gesamt:   ${results.length}`);
console.log(`Bestanden:      ${passed}`);
console.log(`Fehlgeschlagen: ${failed}`);
for(const [l,v] of Object.entries(byLevel)){if(Number(l)<=level)console.log(`Level ${l}:        ${v.p}/${v.t}`);}

const ok=failed===0;
if(ok){
  console.log(`\n\x1b[32m✓ LEVEL ${level} KONFORM — ${passed}/${results.length} Tests bestanden\x1b[0m`);
  console.log(`  Sprint 8: CG-E-012 AuthError | JWT HS256 | RBAC | T-API-* (${apiTests.length} HTTP-Tests)\n`);
}else{
  console.log(`\n\x1b[31m✗ LEVEL ${level} NICHT KONFORM — ${failed} fehlgeschlagen\x1b[0m\n`);
}
process.exit(ok?0:1);
