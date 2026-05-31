import{createHmac,timingSafeEqual,randomBytes}from'node:crypto';import{Errors}from'cg-types/errors.js';
export type CGRole='admin'|'writer'|'reader';
export interface JWTPayload{sub:string;role:CGRole;iss?:string;aud?:string;exp?:number;iat?:number;}
const ROLE_LEVEL:Record<CGRole,number>={admin:3,writer:2,reader:1};
export function hasRole(a:CGRole,r:CGRole):boolean{return ROLE_LEVEL[a]>=ROLE_LEVEL[r];}
// FIX-14 (Entscheidung 2): HS256 (symmetrisch). KEIN OAuth 2.0. RS256/ES256 für Föderation = Roadmap (CG-STD-4100 v1.2).
// Kein hartkodiertes Default-Secret mehr. Produktion: Pflicht-ENV (fail-fast). Dev/Test: ephemeres Zufallssecret pro Prozess
// (Token werden im selben Prozess ausgestellt und verifiziert → In-Process-Suite bleibt konsistent).
const JWT_SECRET:string=process.env['JWT_SECRET']??(()=>{
  if(process.env['NODE_ENV']==='production')throw new Error('[cg-api] FATAL: JWT_SECRET muss in Produktion gesetzt sein (kein Default-Secret).');
  return randomBytes(32).toString('base64url');
})();
const JWT_ISSUER=process.env['JWT_ISSUER']??'chronogrid';
function sign(d:string,s:string):string{return createHmac('sha256',s).update(d).digest('base64url');}
function verifySig(d:string,sig:string,s:string):boolean{const e=sign(d,s);try{const a=Buffer.from(e,'utf8'),b=Buffer.from(sig,'utf8');if(a.length!==b.length)return false;return timingSafeEqual(a,b);}catch{return false;}}
export function issueJWT(sub:string,role:CGRole,ttl=3600):string{const now=Math.floor(Date.now()/1000);const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({sub,role,iss:JWT_ISSUER,aud:'cg-api',iat:now,exp:now+ttl})).toString('base64url');return`${h}.${p}.${sign(`${h}.${p}`,JWT_SECRET)}`;}
export function verifyJWT(token:string):JWTPayload{const parts=token.split('.');if(parts.length!==3)throw Errors.AuthError.invalidToken('Ungültiges Format');const[h,p,s]=parts as[string,string,string];if(!verifySig(`${h}.${p}`,s,JWT_SECRET))throw Errors.AuthError.invalidToken('Signatur ungültig');let payload:JWTPayload;try{payload=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));}catch{throw Errors.AuthError.invalidToken('Payload nicht parsebar');}const now=Math.floor(Date.now()/1000);if(payload.exp&&payload.exp<now)throw Errors.AuthError.tokenExpired('Abgelaufen');return payload;}
export function extractBearer(h:string|undefined):string|null{if(!h)return null;const m=h.match(/^Bearer\s+(.+)$/i);return m?m[1]!:null;}
export type AuthRequirement='public'|'reader'|'writer'|'admin';
export function getRequiredRole(method:string,path:string):AuthRequirement{if(path==='/v1/health'||path==='/v1/openapi.json'||path==='/v1/auth/token')return'public';if(method==='GET'&&path==='/v1/graphql')return'public';if(method==='GET')return'reader';if(path==='/v1/timepoints/validate'||path==='/v1/timepoints/convert'||path==='/v1/domains/validate'||path==='/v1/relations/compute')return'reader';if(method==='POST'&&path==='/v1/graphql')return'reader';if(method==='DELETE'||method==='POST')return'writer';return'reader';}
export interface AuthResult{authenticated:boolean;payload?:JWTPayload;error?:string;}
export function checkAuth(authHeader:string|undefined,required:AuthRequirement):AuthResult{if(required==='public')return{authenticated:true};const token=extractBearer(authHeader);if(!token)return{authenticated:false,error:'Authorization: Bearer <token> fehlt'};try{const payload=verifyJWT(token);if(!hasRole(payload.role,required as CGRole))return{authenticated:false,error:`Rolle '${payload.role}' unzureichend`};return{authenticated:true,payload};}catch(e){return{authenticated:false,error:e instanceof Error?e.message:'Auth-Fehler'};}}
export const TEST_TOKENS={admin:()=>issueJWT('test-admin','admin'),writer:()=>issueJWT('test-writer','writer'),reader:()=>issueJWT('test-reader','reader')};
