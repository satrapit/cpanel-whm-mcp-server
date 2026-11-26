import { existsSync, writeFileSync } from 'node:fs';
if (!existsSync('dist-passenger/main.js')) {
  throw new Error('Passenger output is missing. Build failed or was not run.');
}
// The repository root uses ESM, but this isolated output must be interpreted as CommonJS.
writeFileSync('dist-passenger/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
