// Development-only offline smoke adapter. Not a substitute for strict TypeScript compilation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import ts from 'typescript';
const paths = [
  'src/security/network.ts', 'src/security/upstream.ts', 'src/security/credential-envelope.ts', 'src/connections/connection.ts',
  'src/providers/cpanel.ts', 'src/providers/whm.ts', 'src/capabilities/registry.ts',
];
for (const path of paths) {
  const output = join('dist-core', path.replace(/^src\//, '').replace(/\.ts$/, '.js'));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }).outputText);
}
