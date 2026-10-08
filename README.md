# MYYT — YouTube Otomatik Reklam Geçme

YouTube'da **"Reklamı geç"** butonu aktif olduğunda otomatik olarak gerçek (trusted) tıklama ile geçen hafif bir Chrome eklentisi.

## Nasıl Çalışır

| Dosya | Görev |
|---|---|
| `content.js` | MAIN world'de çalışır; reklam ve skip butonunu tespit eder, koordinatları köprüye iletir. |
| `bridge.js` | ISOLATED world'de köprü; mesajları `chrome.runtime` ile background'a taşır. |
| `background.js` | `chrome.debugger` + CDP `Input.dispatchMouseEvent` ile **isTrusted=true** gerçek tıklama gönderir. |

> YouTube, sentetik (`element.click()`) tıklamaları reddeder; bu yüzden tarayıcının gerçek girdi hattı (CDP) kullanılır.

## Kurulum

1. `chrome://extensions` → **Geliştirici modu** aç.
2. **"Paketlenmemiş olarak yükle"** → bu klasörü seç.
3. Eklenti güncellemesi sonrası YouTube sekmesini **F5** ile yenile.

## Üst Bar Uyarısı

Debugger bağlandığında Chrome üstte "Bu tarayıcı bir uzantı tarafından denetleniyor" uyarısı gösterir; bu güvenlik gereği tamamen kapatılamaz. Eklenti, tıklamadan sonra bağlantıyı otomatik koparır (~5 sn), böylece uyarı kendiliğinden kaybolur. Süreyi değiştirmek için: `background.js` → `DEBUGGER_IDLE_RELEASE_MS`.

## Hata Ayıklama

- `content.js` içinde `debugMode = true` yaparsan konsolda `🚀 MYYT` logları ve sağ altta canlı HUD kutusu görünür.
- Background logları: `chrome://extensions` → eklenti → **Service worker** konsolu.

## Gerekli İzinler

- `debugger` — trusted tıklama
- `tabs` — sekme eşleştirme

## Lisans

Kişisel kullanım serbest.

---
[EN]

# MYYT — Auto Skip YouTube Ads

A lightweight Chrome extension that automatically clicks the YouTube **"Skip ad"** button with a real (trusted) click as soon as it becomes active.

## How It Works

| File | Role |
|---|---|
| `content.js` | Runs in MAIN world; detects ads & the skip button, sends coordinates to the bridge. |
| `bridge.js` | Bridge in ISOLATED world; forwards messages via `chrome.runtime`. |
| `background.js` | Sends a real click (`isTrusted=true`) via `chrome.debugger` + CDP `Input.dispatchMouseEvent`. |

> YouTube rejects synthetic clicks (`element.click()`), so the browser's real input pipeline (CDP) is used.

## Installation

1. Open `chrome://extensions` → enable **Developer mode**.
2. Click **"Load unpacked"** → select this folder.
3. After updating the extension, refresh the YouTube tab with **F5**.

## Debugger Info Bar

Chrome shows an info bar ("An extension is debugging this browser") while the debugger is attached; it cannot be fully hidden by design. The extension auto-detaches ~5s after each click so the bar disappears on its own. To change the delay: `background.js` → `DEBUGGER_IDLE_RELEASE_MS`.

## Debugging

- Set `debugMode = true` in `content.js` to see `🚀 MYYT` console logs and a live HUD box in the bottom-right corner.
- Background logs: `chrome://extensions` → extension → **Service worker** console.

## Required Permissions

- `debugger` — trusted click
- `tabs` — tab matching

## License

Free for personal use.
