import type { CTDDLDomain } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
const VALID_TYPES=['linear','piecewise-linear','nonlinear','relativistic','discrete'];
const VALID_GRAN=['nanosecond','microsecond','millisecond','second','minute','hour','day','week','month','year','decade','century','millennium','megayear','gigayear'];
const VALID_SEM=['time','address','filetype'];
const NAME_RE=/^[A-Za-z0-9_-]{1,63}$/;
const VER_RE=/^\d+\.\d+(\.\d+)?$/;
export function parseDomain(raw:unknown):CTDDLDomain{
  if(typeof raw!=='object'||raw===null||Array.isArray(raw))throw Errors.SyntaxError.invalidJson('Kein JSON-Objekt');
  const d=raw as Record<string,unknown>;
  for(const f of['name','version','type','granularity','extent']){if(!(f in d))throw Errors.SyntaxError.missingField(`Pflichtfeld fehlt: ${f}`);}
  if(typeof d['name']!=='string'||!NAME_RE.test(d['name']))throw Errors.SyntaxError.abnfViolation(`Ungültiger Name: ${d['name']}`);
  if(typeof d['version']!=='string'||!VER_RE.test(d['version']))throw Errors.SyntaxError.invalidVersion(`Ungültiges Format: ${d['version']}`);
  if(!VALID_TYPES.includes(d['type'] as string))throw Errors.SyntaxError.invalidDomainType(`Ungültiger Typ: ${d['type']}`);
  if(!VALID_GRAN.includes(d['granularity'] as string))throw Errors.SyntaxError.invalidGranularity(`Ungültige Granularität: ${d['granularity']}`);
  const sem=d['semantics']??'time';
  if(!VALID_SEM.includes(sem as string))throw Errors.SyntaxError.invalidType(`Ungültige Semantik: ${sem}`);
  const ext=d['extent'] as Record<string,unknown>;
  if(typeof ext!=='object'||ext===null)throw Errors.SyntaxError.missingField('extent muss Objekt sein');
  if(!('min' in ext&&'max' in ext&&'inclusive' in ext))throw Errors.SyntaxError.missingField('extent: min,max,inclusive erforderlich');
  if(d['metadata']){const m=d['metadata'] as Record<string,unknown>;if((m['stability']==='low'||m['stability']==='medium')&&!m['scientific_dependency'])throw Errors.ConstraintError.missingScientificDependency(`stability=${m['stability']} erfordert scientific_dependency`);}
  if(Array.isArray(d['mapping'])&&d['mapping'].length>8)throw Errors.MappingError.chainTooLong(`Chain > 8 (${d['mapping'].length})`);
  return d as unknown as CTDDLDomain;
}
export function serializeDomain(d:CTDDLDomain):string{return JSON.stringify(d,(_k,v)=>typeof v==='bigint'?v.toString():v,2);}
