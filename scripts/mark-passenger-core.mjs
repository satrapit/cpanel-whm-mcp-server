import { writeFileSync } from 'node:fs';
writeFileSync('dist-passenger-core/package.json', '{"type":"commonjs"}\n');
