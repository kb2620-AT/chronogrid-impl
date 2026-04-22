import type{TestCase}from'../runner.js';
import{TEST_TOKENS}from'cg-api/auth.js';
const BASE='http://127.0.0.1:3099';
let _srv:{close:(cb?:()=>void)=>void}|null=null;
async function startServer():Promise<void>{if(_srv)return;process.env['API_PORT']='3099';process.env['API_HOST']='127.0.0.1';process.env['STORAGE']='memory';const{server}=await import('cg-api/server.js' as string);_srv=server as{close:(cb?:()=>void)=>void};await new Promise(r=>setTimeout(r,150));}
async function stopServer():Promise<void>{if(_srv){await new Promise<void>(r=>_srv!.close(()=>r()));_srv=null;}}
async function get(path:string,role?:'admin'|'writer'|'reader'):Promise<{status:number;body:unknown}>{await startServer();const h:Record<string,string>={'Content-Type':'application/json'};if(role)h['Authorization']=`Bearer ${TEST_TOKENS[role]()}`;const r=await fetch(`${BASE}${path}`,{headers:h});return{status:r.status,body:await r.json().catch(()=>({}))};}
async function post(path:string,data:unknown,role?:'admin'|'writer'|'reader'):Promise<{status:number;body:unknown}>{await startServer();const h:Record<string,string>={'Content-Type':'application/json'};if(role)h['Authorization']=`Bearer ${TEST_TOKENS[role]()}`;const r=await fetch(`${BASE}${path}`,{method:'POST',headers:h,body:JSON.stringify(data)});return{status:r.status,body:await r.json().catch(()=>({}))};}
async function del(path:string,role?:'admin'|'writer'|'reader'):Promise<{status:number;body:unknown}>{await startServer();const h:Record<string,string>={'Content-Type':'application/json'};if(role)h['Authorization']=`Bearer ${TEST_TOKENS[role]()}`;const r=await fetch(`${BASE}${path}`,{method:'DELETE',headers:h});return{status:r.status,body:await r.json().catch(()=>({}))};}
export const apiTests:TestCase[]=[
  {id:'T-API-001',level:2,description:'GET /v1/health → 200',run:async()=>(await get('/v1/health')).status,expected:200},
  {id:'T-API-002',level:2,description:'health status=ok',run:async()=>((await get('/v1/health')).body as Record<string,unknown>)['status'],expected:'ok'},
  {id:'T-API-003',level:2,description:'GET /v1/openapi.json → 200',run:async()=>(await get('/v1/openapi.json')).status,expected:200},
  {id:'T-API-004',level:2,description:'GET /v1/auth/token → 200',run:async()=>(await get('/v1/auth/token?role=reader')).status,expected:200},
  {id:'T-API-005',level:2,description:'auth/token gibt token zurück',run:async()=>typeof((await get('/v1/auth/token?role=writer')).body as Record<string,unknown>)['token'],expected:'string'},
  {id:'T-API-006',level:2,description:'GET timepoints ohne Token → 401',run:async()=>(await get('/v1/timepoints')).status,expected:401},
  {id:'T-API-007',level:2,description:'POST timepoints ohne Token → 401',run:async()=>(await post('/v1/timepoints',{domain:'TAI',value:'1'})).status,expected:401},
  {id:'T-API-008',level:2,description:'GET domains ohne Token → 401',run:async()=>(await get('/v1/domains')).status,expected:401},
  {id:'T-API-009',level:2,description:'POST timepoints reader → 403',run:async()=>(await post('/v1/timepoints',{domain:'TAI',value:'1'},'reader')).status,expected:403},
  {id:'T-API-010',level:2,description:'401 enthält CG-E-012.001',run:async()=>((await get('/v1/timepoints')).body as Record<string,unknown>)['code'],expected:'CG-E-012.001'},
  {id:'T-API-011',level:2,description:'403 enthält CG-E-012.002',run:async()=>((await post('/v1/timepoints',{domain:'TAI',value:'1'},'reader')).body as Record<string,unknown>)['code'],expected:'CG-E-012.002'},
  {id:'T-API-012',level:2,description:'POST timepoints writer → 201',run:async()=>(await post('/v1/timepoints',{domain:'TAI',value:'1742041937'},'writer')).status,expected:201},
  {id:'T-API-013',level:2,description:'POST timepoints → machine_id',run:async()=>typeof((await post('/v1/timepoints',{domain:'TAI',value:'1742041937'},'writer')).body as Record<string,unknown>)['machine_id'],expected:'string'},
  {id:'T-API-014',level:2,description:'POST timepoints → CGTA prefix',run:async()=>((await post('/v1/timepoints',{domain:'TAI',value:'1742041937'},'writer')).body as Record<string,unknown>)['cgta']?.toString().startsWith('CG:TAI:'),expected:true},
  {id:'T-API-015',level:2,description:'GET timepoints reader → 200',run:async()=>(await get('/v1/timepoints','reader')).status,expected:200},
  {id:'T-API-016',level:2,description:'GET timepoints → items Array',run:async()=>Array.isArray(((await get('/v1/timepoints','reader')).body as Record<string,unknown>)['items']),expected:true},
  {id:'T-API-017',level:2,description:'GET timepoints/:id → 200',run:async()=>{const r=await post('/v1/timepoints',{domain:'TAI',value:'999000'},'writer');const id=((r.body as Record<string,unknown>)['machine_id']) as string;return(await get(`/v1/timepoints/${id}`,'reader')).status;},expected:200},
  {id:'T-API-018',level:2,description:'GET timepoints/nonexistent → 404',run:async()=>(await get('/v1/timepoints/nonexistent-id','reader')).status,expected:404},
  {id:'T-API-019',level:2,description:'POST convert reader → 200',run:async()=>(await post('/v1/timepoints/convert',{from_domain:'UTC',to_domain:'TAI',value:'0'},'reader')).status,expected:200},
  {id:'T-API-020',level:2,description:'POST validate gültig → 200',run:async()=>(await post('/v1/timepoints/validate',{cgta:'CG:TAI:1742041937/v1'},'reader')).status,expected:200},
  {id:'T-API-021',level:2,description:'POST validate ungültig → 422',run:async()=>(await post('/v1/timepoints/validate',{cgta:'INVALID'},'reader')).status,expected:422},
  {id:'T-API-022',level:2,description:'GET domains reader → 200',run:async()=>(await get('/v1/domains','reader')).status,expected:200},
  {id:'T-API-023',level:2,description:'POST domains/validate reader → 200',run:async()=>(await post('/v1/domains/validate',{name:'TV',version:'1.0',type:'linear',granularity:'second',extent:{min:'0',max:'9999',inclusive:true}},'reader')).status,expected:200},
  {id:'T-API-024',level:2,description:'POST domains writer → 201',run:async()=>(await post('/v1/domains',{name:`D${Date.now()}`,version:'1.0',type:'linear',granularity:'second',extent:{min:'0',max:'9999',inclusive:true},metadata:{stability:'permanent'}},'writer')).status,expected:201},
  {id:'T-API-025',level:2,description:'POST relations/compute reader → 200',run:async()=>(await post('/v1/relations/compute',{a_start:'1',a_end:'5',b_start:'10',b_end:'20'},'reader')).status,expected:200},
  {id:'T-API-026',level:2,description:'relation=BEFORE',run:async()=>((await post('/v1/relations/compute',{a_start:'1',a_end:'5',b_start:'10',b_end:'20'},'reader')).body as Record<string,unknown>)['relation'],expected:'BEFORE'},
  {id:'T-API-027',level:2,description:'POST segments writer → 201',run:async()=>(await post('/v1/segments',{granted_by:'test',size_ns:'1000000'},'writer')).status,expected:201},
  {id:'T-API-028',level:2,description:'segment status=active',run:async()=>((await post('/v1/segments',{granted_by:'t',size_ns:'1000'},'writer')).body as Record<string,unknown>)['status'],expected:'active'},
  {id:'T-API-029',level:2,description:'POST files writer → 201',run:async()=>(await post('/v1/files',{content_hash:'abc123',type_id:'pdf',size_bytes:'1024'},'writer')).status,expected:201},
  {id:'T-API-030',level:2,description:'GET files/:cgfi reader → 200',run:async()=>{const c=await post('/v1/files',{content_hash:'def456',type_id:'txt',size_bytes:'512'},'writer');const cgfi=((c.body as Record<string,unknown>)['cgfi']) as string;return(await get(`/v1/files/${cgfi}`,'reader')).status;},expected:200},
  {id:'T-API-031',level:3,description:'DELETE files → 200 Tombstone',run:async()=>{const c=await post('/v1/files',{content_hash:'del789',type_id:'csv',size_bytes:'256'},'writer');const cgfi=((c.body as Record<string,unknown>)['cgfi']) as string;return(await del(`/v1/files/${cgfi}`,'writer')).status;},expected:200},
  {id:'T-API-032',level:3,description:'GET tombstoned → 410',run:async()=>{const c=await post('/v1/files',{content_hash:'tomb111',type_id:'log',size_bytes:'0'},'writer');const cgfi=((c.body as Record<string,unknown>)['cgfi']) as string;await del(`/v1/files/${cgfi}`,'writer');return(await get(`/v1/files/${cgfi}`,'reader')).status;},expected:410},
  {id:'T-API-033',level:2,description:'POST graphql health → 200',run:async()=>(await post('/v1/graphql',{query:'{ health { status } }'},'reader')).status,expected:200},
  {id:'T-API-034',level:2,description:'GraphQL health.status=ok',run:async()=>((await post('/v1/graphql',{query:'{ health { status } }'},'reader')).body as Record<string,unknown>)['data'],expected:{health:{status:'ok'}}},
  {id:'T-API-035',level:3,description:'X-ChronoGrid-Version Header',run:async()=>{await startServer();const r=await fetch(`${BASE}/v1/health`);return r.headers.get('x-chronogrid-version');},expected:'0.9.0'},
];
export async function teardown():Promise<void>{await stopServer();}
