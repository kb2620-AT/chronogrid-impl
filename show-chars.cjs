const fs = require('fs');
const c = fs.readFileSync('packages/cg-cguas/src/cguas.ts', 'utf8');
const i = c.indexOf('resolve(cgua: bigint)');
const block = c.substring(i-2, i+800);
for(let j=37; j<120; j++) console.log(j, JSON.stringify(block[j]), block.charCodeAt(j).toString(16));
