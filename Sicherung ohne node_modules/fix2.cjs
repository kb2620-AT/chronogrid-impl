const fs = require('fs');
const path = require('path');

// 1. Dateien in richtigen Ordner kopieren
const moves = [
  ['packages/cg-ctddl/src/gregorian.ts', 'packages/cg-engine/src/gregorian.ts'],
  ['packages/cg-ctddl/src/mapping.ts',   'packages/cg-engine/src/mapping.ts'],
  ['packages/cg-ctddl/src/domains.ts',   'packages/cg-engine/src/domains.ts'],
];
moves.forEach(([src, dst]) => {
  if (fs.existsSync(src) && !fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log('Copied: ' + src + ' -> ' + dst);
  }
});

// 2. Alle imports in cg-engine fixen
const engineFiles = fs.readdirSync('packages/cg-engine/src').map(f => 'packages/cg-engine/src/' + f).filter(f => f.endsWith('.ts'));
engineFiles.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/from 'cg-types\/domain'/g, "from '../../cg-types/src/domain.js'");
  c = c.replace(/from 'cg-types\/errors'/g, "from '../../cg-types/src/errors.js'");
  c = c.replace(/from 'cg-engine\/engine'/g, "from './engine.js'");
  c = c.replace(/from 'cg-engine\/mapping'/g, "from './mapping.js'");
  c = c.replace(/from 'cg-engine\/gregorian'/g, "from './gregorian.js'");
  fs.writeFileSync(f, c);
  console.log('Fixed imports: ' + f);
});
console.log('Done!');
