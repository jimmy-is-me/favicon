const MAX_ICON_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const raw = requestUrl.searchParams.get('url') || '';
  const wantsDownload = requestUrl.searchParams.get('download') === '1';

  try {
    const target = normalizeHttpUrl(raw);
    assertSafeTarget(target);

    const upstream = await safeFetchWithTimeout(target.href, {
      headers: {
        'User-Agent': 'FaviconDetector/1.1',
        'Accept': 'image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.2'
      }
    }, 8000);

    if (!upstream.ok) return text(`Upstream HTTP ${upstream.status}`, 502);
    const finalUrl = new URL(upstream.url || target.href);
    assertSafeTarget(finalUrl);

    const declaredLength = Number(upstream.headers.get('content-length') || 0) || 0;
    if (declaredLength > MAX_ICON_BYTES) return text('Image is too large', 413);

    const bytes = new Uint8Array(await readBytesLimited(upstream, MAX_ICON_BYTES));
    const type = detectImageType(bytes);
    if (!type) return text('Target is not a supported image', 415);

    const headers = new Headers();
    headers.set('content-type', type);
    headers.set('cache-control', 'private, max-age=300');
    headers.set('access-control-allow-origin', new URL(context.request.url).origin);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'no-referrer');
    headers.set('content-security-policy', "default-src 'none'; sandbox");
    headers.set('content-length', String(bytes.byteLength));

    if (wantsDownload) headers.set('content-disposition', `attachment; filename="${downloadName(finalUrl, type)}"`);

    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    const message = /abort|timeout/i.test(String(error?.message || error)) ? 'Icon request timed out' : String(error?.message || error || 'Icon proxy failed');
    return text(message, 400);
  }
}

function normalizeHttpUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new Error('Missing icon URL');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https are allowed');
  if (url.username || url.password) throw new Error('Credentialed URLs are not allowed');
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    throw new Error('Only standard HTTP/HTTPS ports are allowed');
  }
  url.hash = '';
  return url;
}

function assertSafeTarget(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https are allowed');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blockedSuffixes = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.onion', '.invalid', '.test'];
  if (!hostname || hostname === 'localhost' || blockedSuffixes.some((suffix) => hostname.endsWith(suffix)) || hostname.includes(':') || isPrivateIpv4(hostname)) {
    throw new Error('Private/internal/special-use target is not allowed');
  }
}

function isPrivateIpv4(host) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const p = host.split('.').map(Number);
  if (p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 0 && p[2] === 0) ||
    (p[0] === 192 && p[1] === 0 && p[2] === 2) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19)) ||
    (p[0] === 198 && p[1] === 51 && p[2] === 100) ||
    (p[0] === 203 && p[1] === 0 && p[2] === 113) || p[0] >= 224;
}

async function safeFetchWithTimeout(rawUrl, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    let current = normalizeHttpUrl(rawUrl);
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      assertSafeTarget(current);
      const response = await fetch(current.href, { ...options, redirect: 'manual', signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      try { if (response.body) await response.body.cancel(); } catch (_) {}
      if (!location) return response;
      if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects');
      current = new URL(location, current);
      assertSafeTarget(current);
    }
    throw new Error('Redirect failed');
  } finally { clearTimeout(timer); }
}

async function readBytesLimited(response, maxBytes) {
  if (!response.body || !response.body.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error('Image is too large');
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch (_) {}
      throw new Error('Image is too large');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return merged.buffer;
}

function detectImageType(bytes) {
  if (!bytes || bytes.length < 4) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const a6 = ascii(bytes, 0, 6);
  if (a6 === 'GIF87a' || a6 === 'GIF89a') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) return 'image/x-icon';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  const textPrefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 4096))).replace(/^\uFEFF/, '').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<svg\b/i.test(textPrefix)) return 'image/svg+xml';
  return '';
}

function ascii(bytes, start, end) {
  if (bytes.length < end) return '';
  return String.fromCharCode(...bytes.slice(start, end));
}

function downloadName(url, type) {
  const extByType = {
    'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/avif': 'avif', 'image/x-icon': 'ico'
  };
  return `favicon.${extByType[type] || 'img'}`;
}

function text(message, status) {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox"
    }
  });
}
