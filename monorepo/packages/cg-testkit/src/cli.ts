import{runTests}from'./runner.js';
import{engineTests}from'./suites/t-engine.js';
import{storageTests}from'./suites/t-storage.js';
import{authTests}from'./suites/t-auth.js';
import{apiTests,teardown}from'./suites/t-api.js';
import{ucTests}from'./suites/t-uc.js';
import{ALL_T_CGUAS}from'./suites/t-cguas.js';
import{cosmicTests}from'./suites/t-l3-cosmic.js';
import{ALL_T_L3_PENDING,PENDING_SUMMARY}from'./suites/t-l3-pending.js';
import{T_L3_RK45}from'./suites/t-l3-rk45.js';
import{T_L3_SP3}from'./suites/t-l3-sp3.js';
import{handleGraphQL}from'cg-api/graphql.js';
import{signPayload,verifySignature}from'cg-api/webhooks.js';
import{InMemoryTimepointRepository,InMemoryDomainRepository,InMemoryManifestRepository,InMemoryRelationRepository,InMemorySegmentRepository}from'cg-storage/repository.js';
import{nowTaiNs}from'cg-engine/engine.js';
import type{APIContext}from'cg-api/handlers.js';
import type{TestCase}from'./runner.js';
import{writeFileSync}from'node:fs';
const args=process.argv.slice(2);
const level=parseInt(args[args.indexOf('--level')+1]??'3',10) as 1|2|3;
const isJson=args.includes('--json');
const doReport=args.includes('--report');
function makeCtx():APIContext{return{timepoints:new InMemoryTimepointRepository(),domains:new InMemoryDomainRepository(),manifests:new InMemoryManifestRepository(),relations:new InMemoryRelationRepository(),segments:new InMemorySegmentRepository(),now:nowTaiNs};}
type GQL={data?:Record<string,unknown>;errors?:unknown[]};
const sprint7Tests:TestCase[]=[
  {id:'T-S7-001',level:2,description:'GraphQL health',run:async()=>((await handleGraphQL('{ health { status } }',undefined,makeCtx())) as GQL).data?.['health'],expected:{status:'ok'}},
  {id:'T-S7-002',level:2,description:'GraphQL allenRelation BEFORE',run:async()=>((await handleGraphQL('{ allenRelation(a_start:"1" a_end:"5" b_start:"10" b_end:"20") }',undefined,makeCtx())) as GQL).data?.['allenRelation'],expected:'BEFORE'},
  {id:'T-S7-003',level:2,description:'GraphQL createTimepoint',run:async()=>((await handleGraphQL('mutation { createTimepoint(domain:"TAI",value:"1742041937") { cgta } }',undefined,makeCtx())) as GQL).data?.['createTimepoint'],expected:{cgta:'CG:TAI:1742041937/v1'}},
  {id:'T-S7-004',level:2,description:'GraphQL allocateSegment',run:async()=>((await handleGraphQL('mutation { allocateSegment(granted_by:"t",size_ns:"1000") { status } }',undefined,makeCtx())) as GQL).data?.['allocateSegment'],expected:{status:'active'}},
  {id:'T-S7-005',level:3,description:'GraphQL ungültige Query',run:async()=>Array.isArray(((await handleGraphQL('{ bad }',undefined,makeCtx())) as GQL).errors),expected:true},
  {id:'T-S7-006',level:2,description:'Webhook signPayload',run:()=>signPayload('s','b').startsWith('sha256='),expected:true},
  {id:'T-S7-007',level:2,description:'Webhook verifySignature korrekt',run:()=>{const b='{"t":1}';return verifySignature('s',b,signPayload('s',b));},expected:true},
  {id:'T-S7-008',level:2,description:'Webhook verifySignature falsch',run:()=>verifySignature('s','b','sha256=bad'),expected:false},
];
// skip:true-Tests (t-l3-pending) werden nicht ausgeführt, aber im Report gezählt
const allTests:TestCase[]=[...engineTests,...storageTests,...sprint7Tests,...authTests,...apiTests,...ucTests,...ALL_T_CGUAS,...cosmicTests,...T_L3_RK45,...T_L3_SP3];
const skipTests=(ALL_T_L3_PENDING as Array<TestCase&{skip?:boolean;skipReason?:string}>).filter(t=>t.skip===true);
const filtered=allTests.filter(t=>t.level<=level);
const skippedCount=skipTests.filter(t=>t.level<=level).length;
console.log(`\n┌──────────────────────────────────────────────────────────────┐`);
console.log(`│  ChronoGrid Conformance Testkit — CG-STD-5100 v1.4           │`);
console.log(`│  Sprint 11-A: Standardisierungsreife                         │`);
console.log(`│  Level: ${level} | Aktiv: ${String(filtered.length).padEnd(4)} | Skip: ${String(skippedCount).padEnd(4)} | Gesamt: ${allTests.length+skipTests.length}   │`);
console.log(`└──────────────────────────────────────────────────────────────┘\n`);
if(skippedCount>0){console.log(`  ⏭  ${skippedCount} pending-Tests übersprungen (${PENDING_SUMMARY.pending_v12} pending-v1.2, ${PENDING_SUMMARY.pending_sprint_11b} pending-Sprint-11-B, ${PENDING_SUMMARY.pending_referenz} pending-Referenz)\n`);}
const results=await runTests(allTests,level);
await teardown();
if(doReport){
  const r={
    title:'ChronoGrid Conformance Report',
    version:'0.9.0',
    cgStd:'CG-STD-5100 v1.4',
    sprint:'Sprint 11-A',
    generatedAt:new Date().toISOString(),
    conformance:{
      level:3,
      passed:results.filter(r=>r.passed).length,
      failed:results.filter(r=>!r.passed).length,
      skipped:skippedCount,
      total:results.length+skippedCount,
      compliant:results.every(r=>r.passed),
    },
    pending:{
      pending_v12:PENDING_SUMMARY.pending_v12,
      pending_sprint_11b:PENDING_SUMMARY.pending_sprint_11b,
      pending_referenz:PENDING_SUMMARY.pending_referenz,
      details:{
        worm_oais:PENDING_SUMMARY.worm_oais,
        geo_redundancy:PENDING_SUMMARY.geo_redundancy,
        rk45_classb:PENDING_SUMMARY.rk45_classb,
        graphql_sub:PENDING_SUMMARY.graphql_sub,
        event_bus_mtls:PENDING_SUMMARY.event_bus_mtls,
        anchoring_audit:PENDING_SUMMARY.anchoring_audit,
        sp3_velocity_ref:PENDING_SUMMARY.sp3_velocity_ref,
      },
    },
    results:results.map(r=>({id:r.id,level:r.level,passed:r.passed,durationMs:r.durationMs})),
  };
  writeFileSync('conformance-report.json',JSON.stringify(r,null,2));
  console.log('✓ conformance-report.json geschrieben');
}
if(isJson){console.log(JSON.stringify(results,null,2));process.exit(results.some(r=>!r.passed)?1:0);}
let passed=0,failed=0;
const byLevel:{[k:number]:{p:number;t:number}}={1:{p:0,t:0},2:{p:0,t:0},3:{p:0,t:0}};
for(const r of results){const c=r.passed?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m';console.log(`  ${c} [L${r.level}] ${r.id.padEnd(16)} ${r.description.slice(0,48).padEnd(48)} ${r.durationMs}ms`);if(!r.passed&&r.error)console.log(`       └─ ${r.error}`);r.passed?passed++:failed++;byLevel[r.level]!.t++;if(r.passed)byLevel[r.level]!.p++;}
console.log('\n──────────────────────────────────────────────────────────────');
console.log(`Tests gesamt:   ${results.length} aktiv + ${skippedCount} pending`);
console.log(`Bestanden:      ${passed}`);
console.log(`Fehlgeschlagen: ${failed}`);
for(const[l,v]of Object.entries(byLevel)){if(Number(l)<=level)console.log(`Level ${l}:        ${v.p}/${v.t}`);}
const ok=failed===0;
if(ok){console.log(`\n\x1b[32m✓ LEVEL ${level} (Kernpfade) KONFORM — ${passed} aktiv/${results.length} bestanden, ${skippedCount} pending\x1b[0m`);console.log(`  Klasse-B/RK45 + SP3-Kette aktiv (T-L3-RK45-001–006, T-L3-SP3-001–007, exakte BigInt-Arithmetik); ${skippedCount} Stubs dokumentiert offen (Sprint 11-B / CG-STD-4100 v1.2 / fehlende Referenz)\n`);}
else{console.log(`\n\x1b[31m✗ LEVEL ${level} NICHT KONFORM — ${failed} fehlgeschlagen\x1b[0m\n`);}
process.exit(ok?0:1);
