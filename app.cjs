'use strict';
// Phusion Passenger loads this file with require(). Keep it free of optional dependencies.
// Run 'pnpm build:passenger' before deploying; the compiled entry is intentionally ignored by Git.
process.chdir(__dirname);
require('./dist-passenger/main.js');
