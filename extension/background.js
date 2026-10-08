"use strict";

// ============================================================
// Background Service Worker (Manifest V3)
//
// Content script'ten gonderilen REAL_CLICK_REQUEST mesajini
// alip, chrome.debugger (CDP) uzerinden Input.dispatchMouseEvent
// ile sayfaya GERCEK (trusted) bir fare tiklamasi enjekte eder.
// Bu sayede YouTube'un "untrusted event" kontrolunu asariz.
//
// Not: Manifest dosyasinda "debugger" izni bulunmali. Chrome,
// debugger baglaninca adres cubugunda kullani uyaran bir cizgi
// gosterir ("extension is debugging this browser").
// ============================================================

const attachedTabs = new Set();

// Sadece reklam atlamasi gerektiginde debugger'a baglan, sonra birak.
// Chrome'un ust bardaki "Bu tarayici bir uzanti tarafindan hata ayiklama modunda"
// uyarisi yalnizca debugger BAGLI iken gorunur; baglanti birakilinca uyarı da kaybolur.
const DEBUGGER_IDLE_RELEASE_MS = 5000;
const releaseTimers = new Map(); // tabId -> timeout id

console.log("[MYYT-BG] ✅ background.js (service worker) yuklendi/hayata gecti.");

const scheduleRelease = function (tabId) {
    // Var olan zamanlayiciyi iptal et (yeni tiklama gelirse sure sifirlansin)
    const existing = releaseTimers.get(tabId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        releaseTimers.delete(tabId);
        if (!attachedTabs.has(tabId)) return;

        try {
            chrome.debugger.detach({ tabId });
            console.log("[MYYT-BG] 🧹 debugger birakildi (bosta), tab:", tabId, "-> ust bar uyarisi artik kaybolmali.");
        } catch (e) {
            /* zaten kopmus olabilir - onemsiz */
        } finally {
            attachedTabs.delete(tabId);
        }
    }, DEBUGGER_IDLE_RELEASE_MS);

    releaseTimers.set(tabId, timer);
};

// "Another debugger is already attached" gibi gecici hatalarda tekrar dene
const retryAsync = async function (fn, attempts = 3, delayMs = 400) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
};

const ensureAttached = async function (tabId) {
    // Yeni bir tiklama geldigi icin bosta-birakma zamanlayicisini iptal et
    const pending = releaseTimers.get(tabId);
    if (pending) {
        clearTimeout(pending);
        releaseTimers.delete(tabId);
    }

    if (attachedTabs.has(tabId)) {
        console.log("[MYYT-BG] debugger zaten bagli, tab:", tabId);
        return true;
    }

    console.log("[MYYT-BG] debugger BAGLANIYOR, tab:", tabId);
    try {
        await retryAsync(() => chrome.debugger.attach({ tabId }, "1.3"));
        attachedTabs.add(tabId);
        // CDP sayfasini etkinlestir: aksi halde bazi surumlerde gonderilen
        // Input.dispatchMouseEvent olaylari goz ardi edilebiliyor.
        try {
            await chrome.debugger.sendCommand({ tabId }, "Page.enable", {});
        } catch (e) { /* onemsiz - sadece daha güvenilir olay iletimi icin */ }
        console.log("[MYYT-BG] ✅ debugger basariyla baglandi, tab:", tabId);
        return true;
    } catch (e) {
        // Zaten bagliysa "Already attached" hatasi alinir - sorun degil
        if (String(e && e.message).includes("Already attached")) {
            attachedTabs.add(tabId);
            console.log("[MYYT-BG] ✅ debugger zaten bagli idi (attach hatasi yutuldu), tab:", tabId);
            return true;
        }
        console.warn("[MYYT-BG] ❌ debugger ATTACH BASARISIZ:", e && e.message);
        console.warn("   -> Olasi nedenler: baska bir debugger/DevTools bu sekmeye bagli, ya da 'debugger' izni manifest'te yok.");
        return false;
    }
};

const dispatchRealClick = async function (tabId, x, y) {
    const ok = await ensureAttached(tabId);
    if (!ok) return { success: false, reason: "attach_failed" };

    try {
        console.log("[MYYT-BG] 🖱️ Input.dispatchMouseEvent gonderiliyor (mousePressed+Released) tab:", tabId, "koordinat:", x, y);
        // mousePressed + mouseReleased = gercek bir tiklama
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: x,
            y: y,
            button: "left",
            clickCount: 1,
            buttons: 1,
        });
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: x,
            y: y,
            button: "left",
            clickCount: 1,
            buttons: 0,
        });
        console.log("[MYYT-BG] ✅ trusted tiklama CEBIRLI YOLLA sayfaya iletildi.");
        // Tiklama bitti: bir sure sonra debugger'i birak ki ust bar uyarisi kaybolsun
        scheduleRelease(tabId);
        return { success: true };
    } catch (e) {
        console.warn("[MYYT-BG] ❌ dispatchMouseEvent BASARISIZ:", e && e.message);
        return { success: false, reason: String(e && e.message) };
    }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "REAL_CLICK_REQUEST") {
        console.log("[MYYT-BG] 📥 REAL_CLICK_REQUEST alindi:", message.x, message.y, "| sender tab:", sender.tab && sender.tab.id);

        const tabId = sender.tab && sender.tab.id;
        if (tabId === undefined) {
            console.warn("[MYYT-BG] ❌ sender.tab yok - mesaj content script'ten gelmemis olabilir!");
            sendResponse({ success: false, reason: "no_tab" });
            return;
        }

        dispatchRealClick(tabId, message.x, message.y).then((result) => {
            console.log("[MYYT-BG] 📤 Sonuc content'e donuyor:", JSON.stringify(result));
            sendResponse(result);
        });

        // async sendResponse icin true donuyoruz
        return true;
    }
});

// Sekme kapaninca debugger bagliligini temizle
chrome.tabs.onRemoved.addListener((tabId) => {
    const pending = releaseTimers.get(tabId);
    if (pending) {
        clearTimeout(pending);
        releaseTimers.delete(tabId);
    }
    if (attachedTabs.has(tabId)) {
        attachedTabs.delete(tabId);
        try {
            chrome.debugger.detach({ tabId });
        } catch (e) { /* onemsiz */ }
    }
});

// Debugger baglantisi kullanici tarafindan kapatilirsa setten cikar
chrome.debugger.onDetach.addListener((source) => {
    if (source && source.tabId !== undefined) {
        attachedTabs.delete(source.tabId);
    }
});

// Service worker uyurken zamanlayicilar kaybolabilir; uyaninca
// "bagli gorunup aslinda birakilmis" sekmeleri temizle ve gereksiz
// uyarinin kalici olmasini engellemek icin bosta sekmleri birak.
chrome.runtime.onStartup?.addListener(() => attachedTabs.clear());
chrome.debugger.onAttachmentChanged?.addListener((source, attached) => {
    if (!attached && source && source.tabId !== undefined) {
        attachedTabs.delete(source.tabId);
    }
});
