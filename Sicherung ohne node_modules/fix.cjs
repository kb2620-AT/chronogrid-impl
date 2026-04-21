const fs = require('fs');
const files = [
  'packages/cg-engine/src/engine.ts',
  'packages/cg-engine/src/gregorian.ts',
  'packages/cg-engine/src/mapping.ts',
  'packages/cg-engine/src/domains.ts',
];
files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/from 'cg-types\/domain'/g, "from '../../cg-types/src/domain.js'");
  c = c.replace(/from 'cg-types\/errors'/g, "from '../../cg-types/src/errors.js'");
  c = c.replace(/from 'cg-engine\/engine'/g, "from './engine.js'");
  c = c.replace(/from 'cg-engine\/mapping'/g, "from './mapping.js'");
  fs.writeFileSync(f, c);
  console.log('Fixed: ' + f);
});
