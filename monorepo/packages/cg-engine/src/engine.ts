import{createHash}from'node:crypto';
import type{CTDDLDomain,CGTA,CGTimepoint,AllenRelation}from'cg-types/domain.js';
import{Errors}from'cg-types/errors.js';
import{iso8601ToSeconds,secondsToISO8601}from'./gregorian.js';
import{utcToTai,taiToUtc,gpsToTai,taiToGps,CURRENT_TAI_MINUS_UTC}from'./mapping.js';
import{BUILTIN_DOMAINS}from'./domains.js';
const _reg=new Map<string,CTDDLDomain>();
for(const d of BUILTIN_DOMAINS)_reg.set(`${d.name}@${d.version}`,d);
export function registerDomain(d:CTDDLDomain):void{const k=`${d.name}@${d.version}`;if(_reg.has(k))throw Errors.SemanticError.duplicateName(k);_reg.set(k,d);}
export function getDomain(n:string,v='1.0'):CTDDLDomain{const d=_reg.get(`${n}@${v}`);if(!d)throw Errors.VersionError.notFound(`${n}@${v}`);return d;}
export function listDomainKeys():string[]{return[..._reg.keys()];}
export function encodeCGTA(c:CGTA):string{return`CG:${c.domain}:${c.value}/v${c.version}`;}
export function decodeCGTA(raw:string):CGTA{const m=raw.match(/^CG:([^:]+):(-?\d+)(?:\[([A-Za-z\/+\-0-9]+)\])?\/v(\d+)$/);if(!m)throw Errors.SyntaxError.abnfViolation(`CGTA: ${raw}`);return{domain:m[1]!,value:BigInt(m[2]!),version:Number(m[4]!),timezone:(m[3]??'none') as any};}
export function computeMachineId(n:string,v:bigint,ver:string):string{if(!/^[A-Za-z0-9_-]{1,63}$/.test(n))throw Errors.SyntaxError.abnfViolation(`MachineID-Name: ${n}`);return createHash('sha256').update(`${n}:${v}:${ver}`).digest('hex');}
export function computeCGFI(t:string,c:string,y:string):string{return createHash('sha256').update(`${t}:${c}:${y}`).digest('hex');}
export function convertValue(value:bigint,from:string,to:string,max=8):bigint{
  if(from===to)return value;if(max<=0)throw Errors.MappingError.chainTooLong('Chain>8');
  if(from==='UTC'&&to==='TAI')return utcToTai(value);if(from==='TAI'&&to==='UTC')return taiToUtc(value);
  if(from==='GPS'&&to==='TAI')return gpsToTai(value);if(from==='TAI'&&to==='GPS')return taiToGps(value);
  if(from==='Unix'&&to==='UTC')return value+iso8601ToSeconds('1970-01-01T00:00:00Z');
  if(from==='Unix'&&to==='TAI')return utcToTai(value+iso8601ToSeconds('1970-01-01T00:00:00Z'));
  throw Errors.MappingError.targetNotFound(`${from}->${to}`);}
export function createTimepoint(dn:string,dv:string,value:bigint,labels:Record<string,string>={},createdAt:bigint=BigInt(Date.now())*1_000_000n):CGTimepoint{
  const dom=getDomain(dn,dv);if((dom.semantics??'time')==='relative')throw new Error(`CG-E-008 ConstraintError: ${dn}@${dv} (semantics:relative) erhaelt keine Zeitpunkt-MachineID`);let abs:bigint;try{abs=convertValue(value,dn,'TAI');}catch(e:any){if(e?.code==='CG-E-005.001')abs=value;else throw e;}
  const machineId=computeMachineId(dn,abs,dv);
  const cgta=encodeCGTA({domain:dn,value,version:Number(dv.split('.')[0]),timezone:'none'});
  return{machine_id:machineId,domain_name:dn,domain_version:dv,absolute_value:abs,cgta,labels,created_at:createdAt};}
export interface Interval{start:bigint;end:bigint;}
export function allenRelation(a:Interval,b:Interval):AllenRelation{
  if(a.end<b.start)return'BEFORE';if(b.end<a.start)return'AFTER';
  if(a.end===b.start)return'MEETS';if(b.end===a.start)return'MET_BY';
  if(a.start===b.start&&a.end===b.end)return'EQUALS';
  if(a.start===b.start&&a.end<b.end)return'STARTS';if(b.start===a.start&&b.end<a.end)return'STARTED_BY';
  if(a.end===b.end&&a.start>b.start)return'FINISHES';if(b.end===a.end&&b.start>a.start)return'FINISHED_BY';
  if(a.start>b.start&&a.end<b.end)return'DURING';if(b.start>a.start&&b.end<a.end)return'CONTAINS';
  if(a.start<b.start&&a.end<b.end&&a.end>b.start)return'OVERLAPS';
  if(b.start<a.start&&b.end<a.end&&b.end>a.start)return'OVERLAPPED_BY';if(a.start>=a.end||b.start>=b.end)throw Errors.ConstraintError.mappingConstraintViolated(`invalid interval: a=[,] b=[,]`);throw new Error(`CG-E-006 InvariantError: Allen-Relation nicht klassifizierbar: a=[,] b=[,]`);}
export function compareValues(a:bigint,b:bigint):-1|0|1{return a<b?-1:a>b?1:0;}
export function verifyDeterminism(n:string,v:bigint,ver:string):boolean{return computeMachineId(n,v,ver)===computeMachineId(n,v,ver);}
export function nowTaiNs():bigint{return BigInt(Date.now())*1_000_000n+CURRENT_TAI_MINUS_UTC*1_000_000_000n;}
export function taiToLabel(s:bigint):string{return secondsToISO8601(taiToUtc(s));}
