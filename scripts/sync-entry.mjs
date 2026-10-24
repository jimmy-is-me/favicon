import { readFile, writeFile } from 'node:fs/promises';

// Support both repository-root and public/ Cloudflare output directories.
const source = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
await writeFile(new URL('../index.html', import.meta.url), source.replaceAll('"/assets/', '"/public/assets/'));
