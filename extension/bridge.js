"use strict";

// bridge.js - Izole (ISOLATED) content script.
// gorevi: MAIN world'deki content.js'ten gelen tiklama isteklerini
// window.postMessage / CustomEvent uzerinden alip chrome.runtime.sendMessage
// ile background service worker'a iletmek.
// Ayrica background'dan gelen "RELOAD_REQUEST" mesajinda sayfayi yeniler.

(() => {
    const relayToBackground = function (payload) {
        if (!payload || payload.type !== "REAL_CLICK_REQUEST") return;
        if (typeof payload.x !== "number" || typeof payload.y !== "number") return;

        console.log("🌉 MYYT [bridge] REAL_CLICK alindi, background'a iletiliyor:", payload.x, payload.y);
        try {
            chrome.runtime.sendMessage(payload, (resp) => {
                if (chrome.runtime.lastError) {
                    console.warn("🌉 MYYT [bridge] sendMessage HATASI:", chrome.runtime.lastError.message);
                    console.warn("   -> genelde extension yeniden yuklenmis/silinmis demek. Sayfayi yenilemeyi dene (F5).");
                    return;
                }
                console.log("🌉 MYYT [bridge] background cevabi alindi:", JSON.stringify(resp));
                // Cevabi MAIN world'e de ilet (content.js HUD'da gostersin)
                try {
                    window.postMessage({ source: "MYYT_BG_RESULT", result: resp }, "*");
                } catch (e) { /* ok */ }
            });
        } catch (e) {
            // extension guncellenmis/silinmisse bu hata normaldir
            console.warn("🌉 MYYT [bridge] sendMessage exception:", e);
        }
    };

    // 1) Ayni document'i paylastigimiz MAIN world script'in CustomEvent'i
    document.addEventListener("MYYT_REAL_CLICK", (ev) => {
        relayToBackground(ev.detail);
    });

    // 2) Fallback kopru: window.postMessage
    window.addEventListener("message", (ev) => {
        if (ev.source !== window) return;
        const data = ev.data;

        // DEBUG: content.js'in loglarini izole world console'una da dusur
        // (DevTools'ta context degistirmeden MAIN world loglarini gorursun)
        if (data && data.source === "MYYT_LOG" && Array.isArray(data.args)) {
            console.log("🌉 MYYT [bridge<-content]", ...data.args);
            return;
        }

        if (!data || data.source !== "MYYT_CONTENT") return;
        relayToBackground(data);
    });

    // 3) Background -> content: sayfa yenileme komutu
    try {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg && msg.type === "RELOAD_REQUEST") {
                location.reload();
            }
        });
    } catch (e) { /* context invalidated */ }
})();
