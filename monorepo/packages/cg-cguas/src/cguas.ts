import { createHash } from 'node:crypto';
import type { CGUASegment } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
export interface CGUAParsed{segmentId:string;localOffset:bigint;version:number;}
export function parseCGUA(uri:string):CGUAParsed{const m=uri.match(/^cgua:\/\/([^/]+)\/(\d+)\/v(\d+)$/);if(!m)throw Errors.CGUASError.invalidCGUA(`Ungültige URI: ${uri}`);return{segmentId:m[1]!,localOffset:BigInt(m[2]!),version:Number(m[3]!)};}
export function encodeCGUA(p:CGUAParsed):string{return`cgua://${p.segmentId}/${p.localOffset}/v${p.version}`;}
export interface ISegmentRegistry{allocate(g:string,s:bigint,p?:string):CGUASegment;resolve(id:string):CGUASegment;revoke(id:string):void;list():CGUASegment[];}
export class SegmentRegistry implements ISegmentRegistry{
  private readonly segs=new Map<string,CGUASegment>();private _next=0n;
  allocate(g:string,s:bigint,p?:string):CGUASegment{if(s<=0n)throw Errors.CGUASError.invalidSegmentSize('sizeNs>0');const base=this._next;const id=createHash('sha256').update(`${g}:${base}:${s}:${Date.now()}`).digest('hex').slice(0,16);const seg:CGUASegment={id,parent_id:p??null,base_address:base,size_ns:s,granted_by:g,status:'active',created_at:BigInt(Date.now())*1_000_000n};this.segs.set(id,seg);this._next=base+s;return seg;}
  resolve(id:string):CGUASegment{const s=this.segs.get(id);if(!s)throw Errors.CGUASError.segmentNotFound(id);if(s.status==='revoked')throw Errors.CGUASError.segmentRevoked(id);return s;}
  revoke(id:string):void{const s=this.resolve(id);this.segs.set(id,{...s,status:'revoked'});}
  list():CGUASegment[]{return[...this.segs.values()];}
}
