import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { checkGoogleFavicon as check, WEBP_WARNING } from '../lib/google-favicon.mjs';

function png(w, h = w) {
  const b = new Uint8Array(24); b.set([137,80,78,71]); b.set([73,72,68,82],12);
  const v = new DataView(b.buffer); v.setUint32(16,w); v.setUint32(20,h); return b;
}
test('actual dimensions distinguish minimum, recommendation and invalid shape', () => {
  for (const size of [8, 32, 48]) assert.equal(check(png(size),'image/png').status,'warning');
  for (const size of [49, 96, 512]) assert.equal(check(png(size),'image/png').status,'compatible');
  assert.equal(check(png(7),'image/png').status,'unsupported');
  assert.equal(check(png(96,48),'image/png').status,'unsupported');
});
test('WebP warning and formats not on official list', () => {
  assert.ok(check(new Uint8Array(),'image/webp').messages.includes(WEBP_WARNING));
  for (const type of ['image/webp','image/svg+xml','image/avif']) assert.equal(check(new Uint8Array(),type).format,'unsupported');
  for (const type of ['image/bmp','image/gif','image/x-icon','image/png','image/jpeg','image/x-portable-pixmap','image/tiff']) assert.equal(check(new Uint8Array(),type).format,'supported');
});
test('truncated headers and unknown formats never pass', () => {
  assert.equal(check(png(96).slice(0,20),'image/png').status,'unknown');
  assert.equal(check(png(96),'').status,'unknown');
});
test('ICO includes all directory sizes, including 256 encoded as zero', () => {
  const b = new Uint8Array(38), v = new DataView(b.buffer);
  b.set([0,0,1,0,2,0,32,32]);
  v.setUint32(14,100,true); v.setUint32(18,38,true);
  v.setUint32(30,100,true); v.setUint32(34,138,true);
  const result = check(b,'image/x-icon');
  assert.deepEqual(result.dimensions,[{width:32,height:32},{width:256,height:256}]);
  assert.equal(result.status,'compatible');
  assert.equal(check(b.slice(0,30),'image/x-icon').status,'unknown');
});
test('JPEG and GIF dimensions', () => {
  const gif = new Uint8Array([71,73,70,56,57,97,96,0,96,0]);
  assert.equal(check(gif,'image/gif').status,'compatible');
  const jpg = new Uint8Array([255,216,255,192,0,8,8,0,96,0,96,0]);
  assert.equal(check(jpg,'image/jpeg').status,'compatible');
});
test('API preserves detection contract, ignores misleading URL, MIME and HTML sizes', async () => {
  let source = await readFile(new URL('../functions/api/favicon.js',import.meta.url),'utf8');
  source = source.replace('../../lib/google-favicon.mjs',new URL('../lib/google-favicon.mjs',import.meta.url).href);
  const { onRequestGet } = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (url === 'https://example.com/') return new Response('<link rel="icon" sizes="192x192" type="image/png" href="/misleading.ico">',{headers:{'content-type':'text/html'}});
    if (url.endsWith('/misleading.ico')) return new Response(png(32),{headers:{'content-type':'image/x-icon'}});
    return new Response('not an image',{status:404});
  };
  try {
    const response = await onRequestGet({request:new Request('https://tool.example/api/favicon?url=https://example.com/')});
    const data = await response.json();
    assert.equal(data.ok,true); assert.equal(data.hostname,'example.com');
    assert.equal(data.icons.length,1); assert.equal(data.preferredUrl,data.icons[0].url);
    assert.equal(data.icons[0].contentType,'image/png');
    assert.equal(data.icons[0].sizes,'192x192');
    assert.equal(data.icons[0].googleSearch.status,'warning');
    assert.deepEqual(data.icons[0].googleSearch.dimensions,[{width:32,height:32}]);
    assert.ok(Array.isArray(data.warnings));
  } finally { globalThis.fetch = originalFetch; }
});

test('frontend renders warning and old API unknown state while retaining acquisition', async () => {
  class Element {
    constructor() { this.value = ''; this.children = []; this.listeners = {}; this.classList = {add(){},remove(){}}; }
    set innerHTML(value) { this.markup = value; this.children = []; }
    get innerHTML() { return this.markup; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    appendChild(child) { this.children.push(child); }
    querySelector() { return new Element(); }
  }
  const elements = new Map();
  const created = [];
  const document = {getElementById(id) { if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); }, createElement(){const e = new Element(); created.push(e); return e;}};
  const icons = [
    {url:'https://example.com/a.webp',contentType:'image/webp', googleSearch:check(new Uint8Array(),'image/webp')},
    {url:'https://example.com/legacy.png',contentType:'image/png'}
  ];
  vm.runInNewContext(await readFile(new URL('../public/assets/js/app.js',import.meta.url),'utf8'),{
    document,URL,Image:class {}, fetch:async()=>({ok:true,json:async()=>({ok:true,icons})})
  });
  elements.get('urlInput').value='https://example.com';
  elements.get('detectForm').listeners.submit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  const rows=elements.get('results').children;
  const panels = created.filter(e => e.className?.startsWith('google-check'));
  assert.ok(panels[0].innerHTML.includes(WEBP_WARNING));
  assert.ok(panels[1].innerHTML.includes('無法確認'));
  assert.ok(panels[0].innerHTML.includes('https://developers.google.com/search/docs/appearance/favicon-in-search'));
  assert.equal(rows.length,2);
  assert.equal(elements.get('faviconUrl').value,icons[0].url);
  assert.equal(elements.get('downloadOriginalButton').disabled,false);
  assert.equal(elements.get('summaryCount').textContent,'2');
});
