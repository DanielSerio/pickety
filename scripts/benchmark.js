const { execSync } = require('child_process');
const path = require('path');

const cliPath = path.join(process.cwd(), 'out', 'cli.js');
const projectPath = path.join(process.cwd(), 'benchmark-project');

console.log('Running benchmark...');

const start = Date.now();
try {
  execSync(`node ${cliPath} check --root ${projectPath}`, { stdio: 'inherit' });
} catch (e) {
  // CLI may exit with code 1 if there are violations
}
const end = Date.now();

console.log('\n--------------------------');
console.log(`Benchmark Results:`);
console.log(`Project: Synthetic (500 files, 10 modules)`);
console.log(`Time taken: ${end - start}ms`);
console.log('--------------------------');
