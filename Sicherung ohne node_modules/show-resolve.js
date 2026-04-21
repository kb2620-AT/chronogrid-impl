const fs = require('fs');
let c = fs.readFileSync('packages/cg-cguas/src/cguas.ts', 'utf8');
const i = c.indexOf('resolve(cgua: bigint)');
console.log(JSON.stringify(c.substring(i-2, i+700)));
