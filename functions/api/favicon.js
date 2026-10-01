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
  if (hostname === 'localhost' || blockedSuffixes.so