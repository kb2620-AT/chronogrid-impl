const fs = require('fs');
let c = fs.readFileSync('packages/cg-cguas/src/cguas.ts', 'utf8');
const start = c.indexOf('  resolve(cgua: bigint)');
const afterBrace = c.indexOf('{', start);
// Finde das schließende } der Methode
let depth = 0, end = -1;
for (let i = afterBrace; i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const newMethod = `  resolve(cgua: bigint): CGUASegment {\r\n    checkCGUARange(cgua);\r\n\r\n    // Binaersuche nur auf nicht-Root-Segmenten\r\n    const nonRoot = this.segments.filter(s => s.segment_id !== this.root.segment_id);\r\n    let lo = 0;\r\n    let hi = nonRoot.length - 1;\r\n    let found: CGUASegment | null = null;\r\n\r\n    while (lo <= hi) {\r\n      const mid = Math.floor((lo + hi) / 2);\r\n      const seg = nonRoot[mid];\r\n      if (seg.start_address <= cgua && cgua < seg.end_address) {\r\n        found = seg;\r\n        break;\r\n      } else if (cgua < seg.start_address) {\r\n        hi = mid - 1;\r\n      } else {\r\n        lo = mid + 1;\r\n      }\r\n    }\r\n\r\n    // Fallback: Root wenn kein spezifischeres Segment gefunden\r\n    if (!found && this.root.start_address <= cgua && cgua < this.root.end_address) {\r\n      found = this.root;\r\n    }\r\n\r\n    if (!found) {\r\n      throw Errors.CGUASError.SegmentNotFound(cgua);\r\n    }\r\n    return found;\r\n  }`;
c = c.substring(0, start) + newMethod + c.substring(end);
fs.writeFileSync('packages/cg-cguas/src/cguas.ts', c);
console.log('OK - resolve() gepatcht, Zeichen ' + start + ' bis ' + end);
