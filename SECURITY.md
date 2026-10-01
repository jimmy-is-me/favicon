# Security

此工具會由 Cloudflare Pages Functions 代表使用者抓取公開網址，因此已加入基本 SSRF 與代理濫用防護：

- 僅允許 HTTP / HTTPS。
- 禁止 URL 內含帳號密碼。
- 僅允許標準 80 / 443 連接埠。
- 封鎖常見 localhost、內網、特殊用途 hostname 與私有/保留 IPv4 literal。
- 逐次驗證 HTTP redirect，最多 5 次。
- HTML、候選圖示數量與圖示檔案大小皆有限制。
- 圖示代理會以檔案 magic bytes 驗證 PNG/JPEG/GIF/WEBP/ICO/AVIF/SVG，不會把任意 HTML 當成同源內容輸出。
- 圖示回應附加 CSP sandbox 與 nosniff。

若此服務對外公開且流量增加，建議再於 Cloudflare 增加 Rate Limiting、WAF/Turnstile 或存取控制，以降低濫用與資源消耗。
