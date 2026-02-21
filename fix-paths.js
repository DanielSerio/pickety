const fs = require('fs');

for (const f of [
  'src/test/core/boundaries.test.ts',
  'src/test/core/imports.test.ts',
]) {
  let text = fs.readFileSync(f, 'utf8');

  // boundaries.test.ts already imports normalizePath sometimes? Wait, it doesn't currently.
  // remove existing `import * as path from "path";` to avoid duplicates
  text = text.replace(/import \* as path from "path";\r?\n/g, '');

  // Only add imports once
  if (!text.includes('normalizePath(path.resolve')) {
    const importStr = `import * as path from "path";\nimport { normalizePath } from "../../core/utils";\nconst ROOT_DIR = normalizePath(path.resolve("/project"));\n`;
    text = importStr + text;
  }

  // We can just replace this with const root = ROOT_DIR;
  text = text.replace(/const root = "c:\/project";/g, 'const root = ROOT_DIR;');

  // Replace string usage
  text = text.replace(/\"c:\/project([^\"]*)\"/g, '\`${ROOT_DIR}$1\`');
  text = text.replace(/\'c:\/project([^\']*)\'/g, '\`${ROOT_DIR}$1\`');

  fs.writeFileSync(f, text);
  console.log('Fixed', f);
}
