const HTML_LIMIT = 1_500_000;
const MAX_CANDIDATES = 18;
const REQUEST_TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 5;
const VERIFY_PREFIX_BYTES = 24_576;

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const raw = requestUrl.searchParams.get('url') || '';

  try {
    const target = normalizeHttpUrl(raw);
    assertSafeTarget(target);

    const warnings = [];
    const pageResponse = await safeFetchWithTimeout(target.href, {
      headers: {
        'User-Agent': 'FaviconDetector/1.1',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.6'
      }
    }, REQUEST_TIMEOUT_MS);

    if (!pageResponse.ok) {
      return json({ ok: false, error: `目標網站回傳 HTTP ${pageResponse.status}` }, 502);
    }

    const finalPageUrl = new URL(pageResponse.url || target.href);
    assertSafeTarget(finalPageUrl);

    const contentType = (pageResponse.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      warnings.push('目標網址回傳的內容類型不是 HTML，將只檢查常見 Favicon 路徑。');
    }

    let html = '';
    if (!contentType || contentType.includes('html') || contentType.includes('xhtml')) {
      html = await readTextLimited(pageResponse, HTML_LIMIT);
    } else {
      try { if (pageResponse.body) await pageResponse.body.cancel(); } catch (_) {}
    }

    const baseUrl = resolveBaseUrl(html, finalPageUrl);
    let candidates = [];

    if (html) {
      candidates.push(...extractLinkIcons(html, baseUrl));
      candidates.push(...extractMetaIcons(html, baseUrl));

      const manifests = extractManifestLinks(html, baseUrl).slice(0, 2);
      for (const manifest of manifests) {
        try {
          const manifestIcons = await loadManifestIcons(manifest.url);
          candidates.push(...manifestIcons);
        } catch (_) {
          warnings.push('找到 Web App Manifest，但其中的圖示無法完整讀取。');
        }
      }
    }

    candidates.push(...commonCandidates(finalPageUrl));
    candidates = dedupeCandidates(candidates).slice(0, MAX_CANDIDATES);

    const verified = await verifyCandidates(candidates, 4);
    const icons = verified
      .filter((item) => item.ok)
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
      .map(({ ok, ...item }) => item);

    if (!icons.length) {
      warnings.push('沒有找到可直接存取的網站圖示；本工具不使用第三方 Favicon 聚合服務作為備援。');
    }

    return json({
      ok: true,
      pageUrl: finalPageUrl.href,
      hostname: finalPageUrl.hostname,
      preferredUrl: icons[0]?.url || '',
      icons,
      warnings
    });
  } catch (error) {
    return json({ ok: false, error: friendlyError(error) }, 400);
  }
}

function normalizeHttpUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new Error('請提供網址');
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支援 http / https 網址');
  if (url.username || url.password) throw new Error('不支援含帳號密碼的網址');
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    throw new Error('只支援標準 HTTP / HTTPS 連接埠');
  }
  url.hash = '';
  return url;
}

function assertSafeTarget(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支援 http / https 網址');
  if (url.username || url.password) throw new Error('不支援含帳號密碼的網址');
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    throw new Error('只支援標準 HTTP / HTTPS 連接埠');
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) throw new Error('網址沒有有效主機名稱');
  const blockedSuffixes = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.onion', '.invalid', '.test'];
  if (hostname === 'localhost' || blockedSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error('不支援本機、內部網路或特殊用途網址');
  }
  if (hostname.includes(':')) throw new Error('不支援 IPv6 literal 網址');
  if (isPrivateIpv4(hostname)) throw new Error('不支援私有或保留 IP');
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
    (p[0] === 203 && p[1] === 0 && p[2] === 113) ||
    p[0] >= 224;
}

async function safeFetchWithTimeout(rawUrl, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    let current = normalizeHttpUrl(rawUrl);
    let method = String(options.method || 'GET').toUpperCase();
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      assertSafeTarget(current);
      const response = await fetch(current.href, { ...options, method, redirect: 'manual', signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      try { if (response.body) await response.body.cancel(); } catch (_) {}
      if (!location) return response;
      if (redirectCount === MAX_REDIRECTS) throw new Error('重新導向次數過多');
      current = new URL(location, current);
      assertSafeTarget(current);
      if (response.status === 303) method = 'GET';
    }
    throw new Error('重新導向失敗');
  } finally {
    clearTimeout(timer);
  }
}

async function readTextLimited(response, maxBytes) {
  if (!response.body || !response.body.getReader) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (total >= maxBytes) break;
  }
  try { await reader.cancel(); } catch (_) {}
  text += decoder.decode();
  return text;
}

async function readPrefixLimited(response, maxBytes) {
  if (!response.body || !response.body.getReader) {
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.slice(0, maxBytes);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.byteLength, maxBytes - total);
    chunks.push(value.slice(0, take));
    total += take;
    if (total >= maxBytes) break;
  }
  try { await reader.cancel(); } catch (_) {}
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return merged;
}

function resolveBaseUrl(html, fallbackUrl) {
  const baseTag = (html.match(/<base\b[^>]*>/i) || [])[0];
  if (!baseTag) return fallbackUrl;
  const attrs = parseAttributes(baseTag);
  if (!attrs.href) return fallbackUrl;
  try {
    const url = new URL(attrs.href, fallbackUrl);
    assertSafeTarget(url);
    return url;
  } catch (_) { return fallbackUrl; }
}

function extractLinkIcons(html, baseUrl) {
  const out = [];
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const rel = String(attrs.rel || '').toLowerCase();
    const href = attrs.href;
    