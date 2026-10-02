(() => {
  'use strict';

  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];

  const tabs = qa('[data-tool-target]');
  const views = qa('[data-tool-view]');
  const toast = q('#toast');

  const el = {
    text: q('#textIconInput'),
    fontFamily: q('#textFontFamily'),
    fontWeight: q('#textFontWeight'),
    fontSize: q('#textFontSize'),
    fontSizeValue: q('#textFontSizeValue'),
    textColor: q('#textColor'),
    textColorHex: q('#textColorHex'),
    bgColor: q('#textBgColor'),
    bgColorHex: q('#textBgColorHex'),
    transparent: q('#textTransparent'),
    shape: q('#textShape'),
    padding: q('#textPadding'),
    paddingValue: q('#textPaddingValue'),
    shadow: q('#textShadow'),
    palette: q('#textPalette'),
    previewLarge: q('#textPreviewLarge'),
    previewSmall: q('#textPreviewSmall'),
    previewTab: q('#textPreviewTab'),
    downloadPack: q('#downloadFaviconPackButton'),
    downloadIco: q('#downloadIcoButton'),
    downloadPng: q('#downloadTextPngButton'),
    copyHtml: q('#copyGeneratedHtmlButton'),
    htmlCode: q('#generatedHtmlCode')
  };

  if (!el.text) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTool(tab.dataset.toolTarget));
  });

  const inputEvents = [
    el.text, el.fontFamily, el.fontWeight, el.fontSize,
    el.textColor, el.bgColor, el.transparent, el.shape, el.padding, el.shadow
  ];
  inputEvents.forEach((node) => {
    node.addEventListener(node.type === 'range' ? 'input' : 'change', renderPreviews);
    if (node === el.text) node.addEventListener('input', renderPreviews);
  });

  bindColorPair(el.textColor, el.textColorHex);
  bindColorPair(el.bgColor, el.bgColorHex);

  el.palette.addEventListener('click', (event) => {
    const button = event.target.closest('[data-fg][data-bg]');
    if (!button) return;
    setColor(el.textColor, el.textColorHex, button.dataset.fg);
    setColor(el.bgColor, el.bgColorHex, button.dataset.bg);
    el.transparent.checked = false;
    renderPreviews();
  });

  el.downloadPng.addEventListener('click', async () => {
    const blob = await createPngBlob(512);
    downloadBlob(blob, 'favicon-512x512.png');
    notify('已產生 512 × 512 PNG');
  });

  el.downloadIco.addEventListener('click', async () => {
    const ico = await createIcoBlob([16, 32, 48]);
    downloadBlob(ico, 'favicon.ico');
    notify('已產生 favicon.ico');
  });

  el.downloadPack.addEventListener('click', async () => {
    el.downloadPack.disabled = true;
    el.downloadPack.textContent = '正在建立圖示包…';
    try {
      const files = [];
      const pngSizes = [16, 32, 48, 180, 192, 512];
      for (const size of pngSizes) {
        const blob = await createPngBlob(size);
        const name = size === 180 ? 'apple-touch-icon.png' :
          size === 192 ? 'android-chrome-192x192.png' :
          size === 512 ? 'android-chrome-512x512.png' :
          `favicon-${size}x${size}.png`;
        files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
      }

      const icoBlob = await createIcoBlob([16, 32, 48]);
      files.push({ name: 'favicon.ico', data: new Uint8Array(await icoBlob.arrayBuffer()) });

      const manifest = {
        name: '',
        short_name: '',
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
        ],
        theme_color: el.transparent.checked ? '#ffffff' : normalizeHex(el.bgColorHex.value) || '#0f766e',
        background_color: el.transparent.checked ? '#ffffff' : normalizeHex(el.bgColorHex.value) || '#0f766e',
        display: 'standalone'
      };
      files.push({ name: 'site.webmanifest', data: encodeUtf8(JSON.stringify(manifest, null, 2)) });
      files.push({ name: 'README.txt', data: encodeUtf8(buildPackageReadme()) });

      const zip = createStoredZip(files);
      downloadBlob(zip, 'favicon-package.zip');
      notify('網站圖示包已產生');
    } catch (error) {
      console.error(error);
      notify('建立圖示包失敗，請再試一次');
    } finally {
      el.downloadPack.disabled = false;
      el.downloadPack.textContent = '下載網站圖示包 ZIP';
    }
  });

  el.copyHtml.addEventListener('click', async () => {
    const code = el.htmlCode.textContent || '';
    try {
      await navigator.clipboard.writeText(code);
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    notify('HTML 已複製');
  });

  function switchTool(targetId) {
    views.forEach((view) => view.classList.toggle('hidden', view.id !== targetId));
    tabs.forEach((tab) => {
      const active = tab.dataset.toolTarget === targetId;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.body.classList.toggle('generator-open', targetId === 'generatorView');
    document.body.classList.toggle('image-open', targetId === 'imageView');
    const hashes = { detectorView: '#detector', generatorView: '#text-to-favicon', imageView: '#image-to-favicon' };
    history.replaceState(null, '', hashes[targetId] || '#detector');
    if (targetId === 'generatorView') renderPreviews();
  }

  function bindColorPair(picker, text) {
    picker.addEventListener('input', () => {
      text.value = picker.value.toLowerCase();
      renderPreviews();
    });
    text.addEventListener('input', () => {
      const value = normalizeHex(text.value);
      if (value) picker.value = value;
      if (value) renderPreviews();
    });
    text.addEventListener('blur', () => {
      const value = normalizeHex(text.value) || picker.value;
      text.value = value.toLowerCase();
      picker.value = value;
      renderPreviews();
    });
  }

  function setColor(picker, text, value) {
    const color = normalizeHex(value);
    if (!color) return;
    picker.value = color;
    text.value = color;
  }

  function normalizeHex(value) {
    const raw = String(value || '').trim();
    const short = raw.match(/^#([0-9a-f]{3})$/i);
    if (short) return '#' + short[1].split('').map((c) => c + c).join('').toLowerCase();
    const full = raw.match(/^#([0-9a-f]{6})$/i);
    return full ? '#' + full[1].toLowerCase() : '';
  }

  function renderPreviews() {
    el.fontSizeValue.textContent = `${el.fontSize.value}%`;
    el.paddingValue.textContent = `${el.padding.value}%`;
    el.bgColor.disabled = el.transparent.checked;
    el.bgColorHex.disabled = el.transparent.checked;
    drawIcon(el.previewLarge, 512);
    drawIcon(el.previewSmall, 64);
    drawIcon(el.previewTab, 32);
  }

  function drawIcon(canvas, size) {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const background = normalizeHex(el.bgColorHex.value) || el.bgColor.value || '#0f766e';
    const foreground = normalizeHex(el.textColorHex.value) || el.textColor.value || '#ffffff';
    const padding = Math.max(0, Math.min(26, Number(el.padding.value) || 0)) / 100 * size;

    if (!el.transparent.checked) {
      ctx.fillStyle = background;
      drawShape(ctx, size, el.shape.value);
      ctx.fill();
    }

    const text = (el.text.value || 'W').trim().slice(0, 4) || 'W';
    const family = el.fontFamily.value;
    const weight = el.fontWeight.value;
    let fontPx = size * (Number(el.fontSize.value) || 68) / 100;
    const maxWidth = Math.max(1, size - padding * 2);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = foreground;
    ctx.font = `${weight} ${fontPx}px ${family}`;

    const measured = ctx.measureText(text).width;
    if (measured > maxWidth) {
      fontPx *= maxWidth / measured;
      ctx.font = `${weight} ${fontPx}px ${family}`;
    }

    if (el.shadow.checked) {
      ctx.shadowColor = 'rgba(0,0,0,.28)';
      ctx.shadowBlur = Math.max(1, size * .025);
      ctx.shadowOffsetY = Math.max(1, size * .018);
    }

    const metrics = ctx.measureText(text);
    const visualOffset = ((metrics.actualBoundingBoxAscent || fontPx * .72) - (metrics.actualBoundingBoxDescent || fontPx * .18)) * .05;
    ctx.fillText(text, size / 2, size / 2 + visualOffset);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  function drawShape(ctx, size, shape) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      return;
    }
    const radius = shape === 'square' ? 0 : shape === 'soft' ? size * .28 : size * .17;
    roundedRect(ctx, 0, 0, size, size, radius);
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    drawIcon(canvas, size);
    return canvas;
  }

  function createPngBlob(size) {
    return new Promise((resolve, reject) => {
      makeCanvas(size).toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG 產生失敗'));
      }, 'image/png');
    });
  }

  async function createIcoBlob(sizes) {
    const images = [];
    for (const size of sizes) {
      const blob = await createPngBlob(size);
      images.push({ size, bytes: new Uint8Array(await blob.arrayBuffer()) });
    }

    const headerSize = 6 + images.length * 16;
    const totalSize = headerSize + images.reduce((sum, item) => sum + item.bytes.length, 0);
    const out = new Uint8Array(totalSize);
    const view = new DataView(out.buffer);

    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, images.length, true);

    let offset = headerSize;
    images.forEach((item, index) => {
      const base = 6 + index * 16;
      out[base] = item.size >= 256 ? 0 : item.size;
      out[base + 1] = item.size >= 256 ? 0 : item.size;
      out[base + 2] = 0;
      out[base + 3] = 0;
      view.setUint16(base + 4, 1, true);
      view.setUint16(base + 6, 32, true);
      view.setUint32(base + 8, item.bytes.length, true);
      view.setUint32(base + 12, offset, true);
      out.set(item.bytes, offset);
      offset += item.bytes.length;
    });

    return new Blob([out], { type: 'image/x-icon' });
  }

  function createStoredZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const { time, date } = dosDateTime(new Date());

    files.forEach((file) => {
      const name = encodeUtf8(file.name);
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const crc = crc32(data);

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      centralParts.push(central);

      offset += local.length + data.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  function dosDateTime(dateObj) {
    const year = Math.max(1980, dateObj.getFullYear());
    const date = ((year - 1980) << 9) | ((dateObj.getMonth() + 1) << 5) | dateObj.getDate();
    const time = (dateObj.getHours() << 11) | (dateObj.getMinutes() << 5) | Math.floor(dateObj.getSeconds() / 2);
    return { date, time };
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function encodeUtf8(text) {
    return new TextEncoder().encode(String(text));
  }

  function buildPackageReadme() {
    return `Favicon 網站圖示包

包含：
- favicon.ico（16 / 32 / 48）
- favicon-16x16.png
- favicon-32x32.png
- favicon-48x48.png
- apple-touch-icon.png（180x180）
- android-chrome-192x192.png
- android-chrome-512x512.png
- site.webmanifest

將檔案放到網站根目錄，並把網站頁面提供的 HTML 標籤加入 <head>。
`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  const initialTarget = location.hash === '#text-to-favicon' ? 'generatorView' :
    location.hash === '#image-to-favicon' ? 'imageView' : 'detectorView';
  switchTool(initialTarget);
  renderPreviews();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(renderPreviews).catch(() => {});
  }
})();
