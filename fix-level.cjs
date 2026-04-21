const fs = require('fs');
let c = fs.readFileSync('packages/cg-testkit/src/cli.ts', 'utf8');
const old = "const targetLevel = parseInt(args[args.indexOf('--level') + 1] ?? '3', 10) as 1 | 2 | 3;";
const fix = "const targetLevel = (args.includes('--level') ? parseInt(args[args.indexOf('--level') + 1], 10) : 3) as 1 | 2 | 3;";
if (!c.includes(old)) { console.log('KEIN MATCH'); process.exit(1); }
c = c.replace(old, fix);
fs.writeFileSync('packages/cg-testkit/src/cli.ts', c);
console.log('OK');
