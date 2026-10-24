import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('root deployment entry matches public entry and every local asset exists', async () => {
  const root = new URL('../', import.meta.url);
  const canonical = await readFile(new URL('public/index.html', root), 'utf8');
  const entry = await readFile(new URL('index.html', root), 'utf8');
  assert.equal(entry, canonical.replaceAll('"/assets/', '"/public/assets/'), 'Run npm run sync:entry after editing public/index.html');
  for (const [html, base] of [[entry, root], [canonical, new URL('public/', root)]]) {
    assert.ok(html.includes('lab-theme.css'));
    assert.ok(html.includes('brand-mark'));
    for (const match of html.matchAll(/(?:src|href)="(\/(?:public\/)?assets\/[^"?#]+)"/g)) {
      await access(new URL(match[1].slice(1), base));
    }
  }
});
