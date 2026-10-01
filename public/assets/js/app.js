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
      els.summaryCount.textContent = String(state.icons.length);
      renderResults(state.icons);
      populateAcquire(state.icons, data.preferredUrl || '');

      els.status.textContent = state.icons.length ? '偵測完成' : '未找到圖示';
      els.status.className = 'status-badge ' + (state.icons.length ? 'ok' : 'error');

      if (data.warnings && data.warnings.length) {
        showNotice(data.warnings.join(' '));
      }

      if (scrollToAcquire) {
        els.acquireSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      const message = error && error.message ? error.message : '未知錯誤';
      els.status.textContent = '偵測失敗';
      els.status.className = 'status-badge error';
      els.results.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">!</div>
          <strong>無法連線到偵測 API</strong>
          <span>${escapeHtml(message)}<br>如果你是直接雙擊 index.html 或只上傳 public 資料夾，Functions 不會運作。請依 README 將整個專案部署到 Cloudflare Pages。</span>
        </div>`;
      showNotice('這個版本需要 Cloudflare Pages Functions。完整 ZIP 內已包含 functions/api/favicon.js 與 functions/api/icon.js。');
    } finally {
      setLoading(false);
    }
  }

  function renderResults(icons) {
    if (!icons.length) {
      els.results.innerHTML = '<div class="empty-state"><div class="empty-icon">?</div><strong>沒有找到可使用的 Favicon</strong><span>網站可能沒有設定圖示，或目標站阻擋了伺服器端請求。</span></div>';
      return;
    }

    els.results.innerHTML = '';
    icons.forEach((icon, index) => {
      const item = document.createElement('article');
      item.className = 'result-item';

      const proxyUrl = iconProxyUrl(icon.url);
      const sourceLabel = sourceName(icon.source);
      const sizeLabel = icon.sizes ? `宣告 ${icon.sizes}` : '';
      const typeLabel = icon.contentType || 'image/*';

      item.innerHTML = `
        <div class="result-preview"><img src="${escapeAttr(proxyUrl)}" alt="" loading="lazy"></div>
        <div class="result-info">
          <strong>${escapeHtml(icon.label || `Favicon ${index + 1}`)}</strong>
          <div class="result-url">${escapeHtml(icon.url)}</div>
          <div class="tags">
            <span class="tag good">可使用</span>
            <span class="tag">${escapeHtml(sourceLabel)}</span>
            <span class="tag">${escapeHtml(typeLabel)}</span>
            ${sizeLabel ? `<span class="tag">${escapeHtml(sizeLabel)}</span>` : ''}
            ${icon.fallback ? '<span class="tag warn">備援來源</span>' : ''}
          </div>
        </div>
        <div class="result-actions">
          <button class="small-button primary choose-button" type="button">使用這個</button>
          <button class="small-button copy-button" type="button">複製網址</button>
        </div>`;

      item.querySelector('.choose-button').addEventListener('click', () => {
        selectIcon(icon.url);
        els.acquireSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      item.querySelector('.copy-button').addEventListener('click', () => copyText(icon.url, 'Favicon URL 已複製'));
      els.results.appendChild(item);
    });
  }

  function populateAcquire(icons, preferredUrl) {
    els.source.innerHTML = '';
    if (!icons.length) {
      resetAcquire();
      return;
    }

    icons.forEach((icon, index) => {
      const option = document.createElement('option');
      option.value = icon.url;
      option.textContent = `${icon.label || 'Favicon'}${icon.url === preferredUrl || (!preferredUrl && index === 0) ? '（建議）' : ''}`;
      els.source.appendChild(option);
    });

    els.source.disabled = false;
    selectIcon(preferredUrl && icons.some((icon) => icon.url === preferredUrl) ? preferredUrl : icons[0].url);
  }

  function selectFromDropdown() {
    selectIcon(els.source.value);
  }

  function selectIcon(url) {
    const icon = state.icons.find((entry) => entry.url === url);
    if (!icon) return;

    state.selected = icon;
    els.source.value = icon.url;
    els.faviconUrl.value = icon.url;
    els.htmlTag.value = `<link rel="icon" href="${icon.url}">`;
    els.acquireStatus.textContent = '可取得';
    els.acquireStatus.className = 'status-badge ok';
    els.downloadOriginal.disabled = false;
    els.downloadPng.disabled = false;
    els.openOriginal.disabled = false;

    loadLargePreview(icon);
  }

  function loadLargePreview(icon) {
    state.previewWidth = 0;
    state.previewHeight = 0;
    els.largePreview.innerHTML = '<span>載入預覽中…</span>';
    const img = new Image();
    img.alt = icon.label || 'Favicon';
    img.src = iconProxyUrl(icon.url);
    img.onload = () => {
      state.previewWidth = img.naturalWidth || 0;
      state.previewHeight = img.naturalHeight || 0;
      els.largePreview.innerHTML = '';
      els.largePreview.appendChild(img);
      updatePreviewMeta();
    };
    img.onerror = () => {
      els.largePreview.innerHTML = '<span>預覽載入失敗</span>';
      els.previewMeta.textContent = '原始網址可偵測，但代理預覽載入失敗。';
    };
  }

  function updatePreviewMeta() {
    if (!state.selected) {
      els.previewMeta.textContent = '尚未選擇圖示';
      return;
    }
    const natural = state.previewWidth && state.previewHeight ? `${state.previewWidth} × ${state.previewHeight}` : '尺寸讀取中';
    els.previewMeta.textContent = `原始尺寸：${natural}　｜　類型：${state.selected.contentType || '未知'}　｜　PNG 輸出：${els.size.value} × ${els.size.value}`;
  }

  async function downloadOriginal() {
    if (!state.selected) return;
    const link = document.createElement('a');
    link.href = iconProxyUrl(state.selected.url, true);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadPng() {
    if (!state.selected) return;
    const size = Number(els.size.value) || 128;
    try {
      const img = await loadImage(iconProxyUrl(state.selected.url));
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);

      const sourceW = img.naturalWidth || size;
      const sourceH = img.naturalHeight || size;
      const scale = Math.min(size / sourceW, size / sourceH);
      const drawW = Math.max(1, Math.round(sourceW * scale));
      const drawH = Math.max(1, Math.round(sourceH * scale));
      const x = Math.round((size - drawW) / 2);
      const y = Math.round((size - drawH) / 2);
      ctx.drawImage(img, x, y, drawW, drawH);

      canvas.toBlob((blob) => {
        if (!blob) {
          showToast('PNG 轉檔失敗');
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `favicon-${safeHost()}-${size}x${size}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        showToast('PNG 已產生');
      }, 'image/png');
    } catch (_) {
      showToast('無法轉成 PNG');
    }
  }

  function openOriginal() {
    if (!st