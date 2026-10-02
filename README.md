# Favicon Detector - Cloudflare Pages Functions 版

這一版不是單一 HTML。真正的 Favicon 偵測由 **Cloudflare Pages Functions** 執行，所以不會受到瀏覽器 CORS 限制。

## 專案結構

```text
favicon-detector-cloudflare/
├─ public/
│  ├─ index.html
│  ├─ _headers
│  └─ assets/
│     ├─ css/style.css
│     └─ js/app.js
├─ functions/
│  └─ api/
│     ├─ favicon.js   # 讀取網站 HTML / Manifest / 常見 favicon 路徑
│     └─ icon.js      # 圖示代理、預覽、下載、PNG 轉檔來源
├─ package.json
└─ README.md
```

## Cloudflare Pages 部署方式（建議 GitHub）

1. 把 **整個專案** 推到 GitHub，不是只推 `public/index.html`。
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git。
3. Framework preset：`None`
4. Build command：留空即可。
5. Build output directory：`public`
6. Root directory：專案根目錄（預設即可）。
7. 部署。

Cloudflare 會自動讀取專案根目錄的 `functions/`，建立：

- `/api/favicon?url=https://example.com`
- `/api/icon?url=https://example.com/favicon.ico`

### 很重要

如果你只有把 `public` 資料夾拖進靜態空間，或直接雙擊 `index.html`，**偵測 API 不會存在**，按鈕就抓不到真正資料。

## 本機測試

需有 Node.js：

```bash
npm install
npm run dev
```

然後開啟 Wrangler 顯示的本機網址。

## 功能

### 網站 Favicon 偵測

- 伺服器端抓取網站 HTML
- 解析 `<link rel="icon">`
- 解析 `apple-touch-icon`
- 解析 `mask-icon`
- 解析 Microsoft Tile Image
- 解析 Web App Manifest icons
- 檢查 `/favicon.ico`、`favicon.svg`、`favicon.png` 等常見路徑
- 預覽 favicon
- 複製原始 favicon URL
- 複製 `<link rel="icon">`
- 下載原始 favicon
- 指定 16 / 32 / 48 / 64 / 128 / 180 / 192 / 256 / 512 尺寸並轉為 PNG
- 手機 RWD
- 內建「檢查 API」功能

### 圖片轉 Favicon

- 上傳 PNG / JPG / JPEG 直接轉成網站圖示
- 圖片完全在瀏覽器本機處理，不上傳伺服器
- 支援完整顯示與填滿裁切
- 可調整背景顏色、透明背景、形狀與內距
- 即時預覽大型圖示、32px 圖示與瀏覽器分頁效果
- 下載 512 × 512 PNG、favicon.ico 或完整網站圖示 ZIP
- ZIP 內含 16/32/48 PNG、Apple Touch Icon、Android 192/512 PNG 與 site.webmanifest

### 文字轉 Favicon

- 全介面繁體中文
- 輸入中英文、數字或 Emoji 即時產生網站圖示
- 字體、字重、文字大小、前景色、背景色、透明背景、背景形狀、內距與文字陰影可調
- 即時大型預覽、32px 預覽與瀏覽器分頁模擬
- 下載 512 × 512 PNG
- 下載內含 16 / 32 / 48px PNG 的 `favicon.ico`
- 一鍵產生完整 ZIP：`favicon.ico`、16/32/48 PNG、Apple Touch Icon、Android 192/512 PNG、`site.webmanifest`
- 直接複製建議的 `<head>` Favicon HTML
- 文字圖示在瀏覽器端 Canvas 產生，不需外部 API，也不打包第三方字型檔

## 為什麼這版能真的偵測？

前一版如果完全使用瀏覽器 JavaScript，會被目標網站的 CORS 阻止，JavaScript 無法可靠讀取別人的 HTML `<head>`。

這版的流程改成：

```text
瀏覽器
  ↓
你的 Cloudflare Pages Function
  ↓
目標網站 HTML / Manifest / Favicon
```

因此可以抓到 WordPress Site Icon 這類放在 `/wp-content/uploads/...` 的非固定路徑。

## 著作權、商標與合法使用

- 本專案不內建第三方 Logo、圖片、付費字型或抄錄自其他網站的視覺資產。
- 介面透過 Google Fonts 載入 Noto Serif TC；字型與 Google Fonts 服務仍受各自授權與服務條款規範。
- 本工具只在使用者輸入網址後，即時解析該公開網站自行提供的 Favicon / Manifest 資訊。
- 偵測到的第三方 Favicon **不會被收錄進此 GitHub repository**。
- 第三方網站圖示的著作權、商標及其他權利仍屬各自權利人；能下載檔案不代表取得使用、重製、散布或商標授權。
- 使用者應自行確認其用途符合適用法律、目標網站條款與第三方權利。
- 為降低濫用風險，API 只接受 HTTP/HTTPS 標準連接埠，封鎖常見內網/特殊用途主機，限制重新導向、HTML 大小、圖示大小與請求數量。

## 隱私與資料處理

本專案本身不建立資料庫，也不主動保存輸入網址、抓取結果或下載的圖示。Cloudflare 平台本身可能依你的帳戶設定保留一般服務日誌，請依實際部署設定與適用規範管理。

## 專案權利

本 repository 未授予第三方再利用本專案程式碼的明示授權。若未來要開源，可再自行加入 MIT、Apache-2.0 等授權條款。


## 法律與權利說明

更完整的第三方 Favicon、商標、授權、隱私與公開部署注意事項請見 [LEGAL.md](./LEGAL.md) 與 [COPYRIGHT.md](./COPYRIGHT.md)。

> 本專案已避免內建第三方 Logo / Favicon / 圖片與抄錄他站內容，但實際部署與使用仍應遵守所在地法律、目標網站條款及第三方權利；沒有任何一般性技術檢查能保證所有司法管轄區與所有使用方式都完全零風險。

## Cloudflare Pages 首頁位置

正式建議的 Pages 結構仍是 `public/index.html` 搭配根目錄 `functions/`，Build output directory 請設為 `public`。這也是 Cloudflare Pages Functions 官方建議的結構。

為了避免 Pages 專案誤把 repository 根目錄當成輸出目錄時直接 404，本專案另外保留一份根目錄 `index.html` 相容入口。兩種情況如下：

- **建議設定：** Build output directory = `public` → 使用 `public/index.html`
- **相容模式：** Build output directory = repository root → 使用根目錄 `index.html`

若要完整使用 Favicon 偵測 API，仍需確認根目錄的 `functions/` 有被 Cloudflare Pages Functions 部署。


## 文字產生器的權利設計

文字轉 Favicon 功能使用瀏覽器本機可用的系統字體與 Canvas 產生圖像，repository 不包含第三方付費字型、Logo 或圖庫素材。使用者仍應自行確認輸入的品牌名稱、商標、文字或其他內容具有適當使用權。


## Favicon 新手說明

網站內新增完整說明區，介紹 Favicon 會出現在哪裡、16/32/180/192/512 等常用尺寸的用途、favicon.ico / PNG / Apple Touch Icon / Web App Manifest 的差異，以及如何將產生後的檔案放進網站。

三種工具可以依需求選擇：

1. **網站 Favicon 偵測**：已有網站，想確認目前實際使用哪些圖示。
2. **文字轉 Favicon**：沒有 Logo 圖檔，用品牌縮寫、文字或 Emoji 快速建立。
3. **圖片轉 Favicon**：已有 PNG / JPG Logo 或圖片，直接轉成完整網站圖示包。
