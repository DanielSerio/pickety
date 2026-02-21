import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(process.cwd(), 'benchmark-project');
const MODULE_COUNT = 10;
const FILES_PER_MODULE = 50; // Total 500 files

function init() {
  if (fs.existsSync(ROOT)) {
    fs.rmSync(ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(ROOT);
}

function generateFiles() {
  const modules = Array.from({ length: MODULE_COUNT }, (_, i) => `module_${i}`);

  for (const mod of modules) {
    const modPath = path.join(ROOT, 'src', mod);
    fs.mkdirSync(modPath, { recursive: true });

    for (let i = 0; i < FILES_PER_MODULE; i++) {
      const fileName = `file_${i}.ts`;
      const filePath = path.join(modPath, fileName);

      // Random imports from other modules
      let content = '';
      const targetModCount = 3;
      for (let j = 0; j < targetModCount; j++) {
        const randomMod = modules[Math.floor(Math.random() * modules.length)];
        const randomFileIndex = Math.floor(Math.random() * FILES_PER_MODULE);
        if (randomMod !== mod) {
          content += `import { someFunc } from "../${randomMod}/file_${randomFileIndex}";\n`;
        }
      }
      content += `export function someFunc() {}\n`;
      fs.writeFileSync(filePath, content);
    }
  }
}

function generateConfig() {
  const modules: Record<string, string> = {};
  for (let i = 0; i < MODULE_COUNT; i++) {
    modules[`module_${i}`] = `src/module_${i}/*`;
  }

  const rules: any[] = [];
  // Allow module_i to import module_i+1
  for (let i = 0; i < MODULE_COUNT - 1; i++) {
    rules.push({
      importer: `module_${i}`,
      imports: `module_${i + 1}`,
      allow: true
    });
  }

  const config = {
    modules,
    rules: {
      "module-boundaries": {
        severity: "error",
        rules
      }
    }
  };

  fs.writeFileSync(path.join(ROOT, 'pickety.json'), JSON.stringify(config, null, 2));
}

init();
console.log('Generating files...');
generateFiles();
console.log('Generating config...');
generateConfig();
console.log(`Synthetic project generated at ${ROOT}`);
