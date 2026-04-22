import { createHash } from 'node:crypto';
import type { CTDDLDomain, CGTA, CGTimepoint, AllenRelation } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import { iso8601ToSeconds, secondsToISO8601 } from './gregorian.js';
import { utcToTai, taiToUtc, gpsToTai, taiToGps, CURRENT_TAI_MINUS_UTC } from './mapping.js';
import { BUILTIN_DOMAINS } from './domains.js';
const _registry=new Map<string,CTDDLDomain>();
for(const d of BUILTIN_DOMAINS)_registry.set(`${d.name}@${d.version}`,d);
export function registerDomain(domain:CTDDLDomain):void{const k=`${domain.name}@${domain.version}`;if(_registry.has(k))throw Errors.SemanticError.duplicateName(`Bereits: ${k}`);_registry.set(k,domain);}
export function getDomain(name:string,version='1.0'):CTDDLDomain{const d=_registry.get(`${name}@${version}`);if(!d)throw Errors.VersionError.notFound(`${name}@${version}`);return d;}
export function listDomainKeys():string[]{return[..._registry.keys()];}
export function encodeCGTA(cgta:CGTA):string{return`CG:${cgta.domain}:${cgta.value}/v${cgta.version}`;}
export function decodeCGTA(raw:string):CGTA{const m=raw.match(/^CG:([^:]+):(-?\d+)\/v(\d+)$/);if(!m)throw Errors.SyntaxError.abnfViolation(`Ungültige CGTA: ${raw}`);return{domain:m[1]!,value:BigInt(m[2]!),version:Number(m[3]!),timezone:'none'};}
export function computeMachineId(n:string,v:bigint,ver:string):string{return createHash('sha256').update(`${n}:${v}:${ver}`).digest('hex');}
export function computeCGFI(t:string,c:string,y:string):string{return createHash('sha256').update(`${t}:${c}:${y}`).digest('hex');}
export function convertValue(value:bigint,from:string,to:string,max=8):bigint{
  if(from===to)return value;if(max<=0)throw Errors.MappingError.chainTooLong('Chain>8');
  if(from==='UTC'&&to==='TAI')return utcToTai(value);if(from==='TAI'&&to==='UTC')return taiToUtc(value);
  if(from==='GPS'&&to==='TAI')return gpsToTai(value);if(from==='TAI'&&to==='GPS')return taiToGps(value);
  if(from==='Unix'&&to==='UTC')return value+iso8601ToSeconds('1970-01-01T00:00:00Z');
  if(from==='Unix'&&to==='TAI')return utcToTai(value+iso8601ToSeconds('1970-01-01T00:00:00Z'));
  throw Errors.MappingError.targetNotFound(`Kein Mapping: ${from}->${to}`);}
export function createTimepoint(domainName:string,domainVersion:string,value:bigint,labels:Record<string,string>={}):CGTimepoint{
  getDomain(domainName,domainVersion);
  let abs:bigint;try{abs=convertValue(value,domainName,'TAI');}catch{abs=value;}
  const machineId=computeMachineId(domainName,abs,domainVersion);
  const cgta=encodeCGTA({domain:domainName,value,version:Number(domainVersion.split('.')[0]),timezone:'none'});
  return{machine_id:machineId,domain_name:domainName,domain_version:domainVersion,absolute_value:abs,cgta,labels,created_at:BigInt(Date.now())*1_000_000n};}
export interface Interval{start:bigint;end:bigint;}
export function allenRelation(a:Interval,b:Interval):AllenRelation{
  if(a.end<b.start)return'BEFORE';if(b.end<a.start)return'AFTER';
  if(a.end===b.start)return'MEETS';if(b.end===a.start)return'MET_BY';
  if(a.start===b.start&&a.end===b.end)return'EQUALS';
  if(a.start===b.start&&a.end<b.end)return'STARTS';if(b.start===a.start&&b.end<a.end)return'STARTED_BY';
  if(a.end===b.end&&a.start>b.start)return'FINISHES';if(b.end===a.end&&b.start>a.start)return'FINISHED_BY';
  if(a.start>b.start&&a.end<b.end)return'DURING';if(b.start>a.start&&b.end<a.end)return'CONTAINS';
  if(a.start<b.start&&a.end<b.end&&a.end>b.start)return'OVERLAPS';
  if(b.start<a.start&&b.end<a.end&&b.end>a.start)return'OVERLAPPED_BY';
  return'OVERLAPS';}
export function compareValues(a:bigint,b:bigint):-1|0|1{return a<b?-1:a>b?1:0;}
export function verifyDeterminism(n:string,v:bigint,ver:string):boolean{return computeMachineId(n,v,ver)===computeMachineId(n,v,ver);}
export function nowTaiNs():bigint{return BigInt(Date.now())*1_000_000n+CURRENT_TAI_MINUS_UTC*1_000_000_000n;}
export function taiToLabel(s:bigint):string{return secondsToISO8601(taiToUtc(s));}
