export const GUIDELINES = 'https://developers.google.com/search/docs/appearance/favicon-in-search';
export const WEBP_WARNING = '此圖示可以在瀏覽器正常使用，但 WebP 未列入 Google 搜尋 Favicon 官方支援格式，建議另外提供 PNG 或 ICO。';
const supported = new Set(['image/bmp', 'image/gif', 'image/x-icon', 'image/png', 'image/jpeg', 'image/x-portable-pixmap', 'image/tiff']);

// Read actual file headers only. HTML sizes, MIME declarations and extensions
// are hints, not evidence. A truncated/unsupported header stays unknown.
export function readDimensions(bytes, type) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions = [];
  const add = (width, height) => { if (width > 0 && height > 0) dimensions.push({ width, height }); };
  try {
    if (type === 'image/png' && bytes.length >= 24 && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') add(v.getUint32(16), v.getUint32(20));
    if (type === 'image/gif') add(v.getUint16(6, true), v.getUint16(8, true));
    if (type === 'image/bmp' && v.getUint32(14, true) >= 40) add(v.getInt32(18, true), Math.abs(v.getInt32(22, true)));
    if (type === 'image/x-icon') {
      const count = v.getUint16(4, true);
      if (!count || bytes.length < 6 + count * 16) return [];
      for (let i = 0; i < count; i++) {
        const offset = 6 + i * 16;
        if (!v.getUint32(offset + 8, true) || v.getUint32(offset + 12, true) < 6 + count * 16) return [];
        add(bytes[offset] || 256, bytes[offset + 1] || 256);
      }
    }
    if (type === 'image/jpeg') {
      let p = 2;
      while (p + 3 < bytes.length) {
        if (bytes[p++] !== 0xff) break;
        while (bytes[p] === 0xff) p++;
        const marker = bytes[p++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const length = v.getUint16(p);
        if (length < 2 || p + length > bytes.length) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          add(v.getUint16(p + 5), v.getUint16(p + 3)); break;
        }
        p += length;
      }
    }
  } catch (_) { return []; }
  return dimensions;
}

export function checkGoogleFavicon(bytes, contentType) {
  const dimensions = readDimensions(bytes, contentType);
  const format = supported.has(contentType) ? 'supported' : contentType ? 'unsupported' : 'unknown';
  const square = dimensions.filter(d => d.width === d.height);
  const size = !dimensions.length ? 'unknown' : square.some(d => d.width > 48) ? 'recommended' : square.some(d => d.width >= 8) ? 'warning' : 'invalid';
  const messages = [];
  if (contentType === 'image/webp') messages.push(WEBP_WARNING);
  else if (format === 'unsupported') messages.push('此格式未列入 Google 搜尋 Favicon 官方支援格式，建議另外提供 PNG 或 ICO。');
  else if (format === 'unknown') messages.push('格式無法確認。');
  if (size === 'unknown') messages.push('實際尺寸無法確認，不採用 HTML 宣告尺寸作為合格依據。');
  if (size === 'warning') messages.push('符合最低 8×8 正方形條件，但未達官方建議的大於 48×48；建議提供 96×96 PNG 或 ICO。');
  if (size === 'invalid') messages.push('實際尺寸不符合正方形且至少 8×8 的最低條件。');
  const status = format === 'unsupported' || size === 'invalid' ? 'unsupported' : format === 'unknown' || size === 'unknown' ? 'unknown' : size === 'warning' ? 'warning' : 'compatible';
  return { status, format, size, dimensions, messages, guidelinesUrl: GUIDELINES };
}
