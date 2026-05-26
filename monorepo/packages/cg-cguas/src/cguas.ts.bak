import{createHash}from'node:crypto';import type{CGUASegment}from'cg-types/domain.js';import{Errors}from'cg-types/errors.js';
export interface CGUAParsed{segmentId:string;localOffset:bigint;version:number;}
export function parseCGUA(uri:string):CGUAParsed{const m=uri.match(/^cgua:\/\/([^/]+)\/(\d+)\/v(\d+)$/);if(!m)throw Errors.CGUASError.invalidCGUA(uri);return{segmentId:m[1]!,localOffset:BigInt(m[2]!),version:Number(m[3]!)};}
export function encodeCGUA(p:CGUAParsed):string{return`cgua://${p.segmentId}/${p.localOffset}/v${p.version}`;}
export class SegmentRegistry{private readonly s=new Map<string,CGUASegment>();private _n=0n;
  allocate(g:string,sz:bigint,p?:string):CGUASegment{if(sz<=0n)throw Errors.CGUASError.invalidSegmentSize('sizeNs>0');const base=this._n;const id=createHash('sha256').update(`${g}:${base}:${sz}:${Date.now()}`).digest('hex').slice(0,16);const seg:CGUASegment={id,parent_id:p??null,base_address:base,size_ns:sz,granted_by:g,status:'active',created_at:BigInt(Date.now())*1_000_000n};this.s.set(id,seg);this._n=base+sz;return seg;}
  resolve(id:string):CGUASegment{const s=this.s.get(id);if(!s)throw Errors.CGUASError.segmentNotFound(id);if(s.status==='revoked')throw Errors.CGUASError.segmentRevoked(id);return s;}
  revoke(id:string):void{const s=this.resolve(id);this.s.set(id,{...s,status:'revoked'});}
  list():CGUASegment[]{return[...this.s.values()];}
}
