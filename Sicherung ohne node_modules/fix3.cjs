const fs = require('fs');

// tsconfig auf CommonJS umstellen
const tsconfig = {
  compilerOptions: {
    target: "ES2022",
    module: "CommonJS",
    moduleResolution: "node",
    esModuleInterop: true,
    strict: false,
    baseUrl: ".",
    paths: {
      "cg-types/*": ["packages/cg-types/src/*"],
      "cg-ctddl/*": ["packages/cg-ctddl/src/*"],
      "cg-engine/*": ["packages/cg-engine/src/*"],
      "cg-cguas/*": ["packages/cg-cguas/src/*"],
      "cg-storage/*": ["packages/cg-storage/src/*"],
      "cg-api/*": ["packages/cg-api/src/*"]
    }
  }
};

fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
console.log('tsconfig.json updated');