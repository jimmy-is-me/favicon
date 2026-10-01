(() => {
  'use strict';

  const els = {
    form: document.getElementById('detectForm'),
    url: document.getElementById('urlInput'),
    detect: document.getElementById('detectButton'),
    acquire: document.getElementById('acquireButton'),
    status: document.getElementById('statusBadge'),
    notice: document.getElementById('apiNotice'),
    results: document.getElementById('results'),
    summaryDomain: document.getElementById('summaryDomain'),
    summaryCount: document.getElementById('summaryCount'),
    acquireSection: document.getElementById('acquireSection'),
    acquireStatus: document.getElementById('acquireStatus'),
    source: document.getElementById('sourceSelect'),
    size: document.getElementById('sizeSelect'),
    faviconUrl: document.getElementById('faviconUrl'),
    htmlTag: document.getElementById('htmlTag'),
    largePreview: document.getElementById('largePreview'),
    previewMeta: document.getElementById('previewMeta'),
    copyUrl: document.getElementById('copyUrlButton'),
    copyHtml: document.getElementById('copyHtmlButton'),
    downloadOriginal: document.getElementById('downloadOriginalButton'),
    downloadPng: document.getElementById('downloadPngButton'),
    openOriginal: document.getElementById('openOriginalButton'),
    checkApi: document.getElementById('checkApiButton'),
    diagnostic: document.getElementById('diagnosticBody'),
    toast: document.getElementById('toast')
  };

  const state = {
    pageUrl: '',
    icons: [],
    selected: null,
    previewWidth: 0,
    previewHeight: 0
  };

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    runDetection(false);
  });

  els.acquire.addEventListener('click', () => runDetection(true));
  els.source.addEventListener('change', selectFromDropdown);
  els.size.addEventListener('change', updatePreviewMeta);
  els.copyUrl.addEventListener('click', () => copyText(els.faviconUrl.value, 'Favicon URL 已複製'));
  els.copyHtml.addEventListener('click', () => copyText(els.htmlTag.value, 'HTML 標籤已複製'));
  els.downloadOriginal.addEventListener('click', downloadOriginal);
  els.downloadPng.addEventListener('click', downloadPng);
  els.openOriginal.addEventListener('click', openOriginal);
  els.checkApi.addEventListener('click', checkApi);

  function normalizeUrl(raw) {
    let value = String(raw || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      return parsed.href;
    } catch (_) {
      return '';
    }
  }

  async function runDetection(scrollToAcquire) {
    const url = normalizeUrl(els.url.value);
    if (!url) {
      showToast('請輸入有效的 http / https 網址');
      els.url.focus();
      return;
    }

    state.pageUrl = url;
    els.url.value = url;
    const parsed = new URL(url);
    els.summaryDomain.textContent = parsed.hostname;
    els.summaryCount.textContent = '0';
    setLoading(true);
    hideNotice();
    resetAcquire();
    els.results.innerHTML = '<div class="empty-state"><div class="empty-icon">…</div><strong>正在讀取網站</strong><span>Cloudflare Function 正在解析 HTML、Manifest 與常見 Favicon 路徑。</span></div>';

    try {
      const response = await fetch('/api/favicon?url=' + encodeURIComponent(url), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        throw new Error('API 沒有回傳 JSON。請確認 Cloudflare Pages Functions 有一起部署。');
      }

      if (!response.ok || !data || !data.ok) {
        throw new Error((data && data.error) || '偵測失敗，HTTP ' + response.status);
      }

      state.pageUrl = data.pageUrl || url;
      state.icons = Array.isArray(data.icons) ? data.icons : [];
      els.summaryDomain.textContent = data.hostname || parsed.hostname;
      els.summaryCount.textContent = Str