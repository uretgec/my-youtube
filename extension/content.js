"use strict";

// NOTE: Bu dosya manifest'te "world": "MAIN" ile yuklenir (sayfanin kendi JS
// ortaminda). Bu yuzden chrome.* API'leri burada mevcut DEGIL; background'a
// mesaji CustomEvent + window.postMessage koprusu ile gonderiyoruz.

// debug
const debugMode = false;

// ============================================================
// DEBUG NOKTALARI
// Tum loglar "🚀 MYYT" oneki ile basilir.
//
// NEREDE GORULUR?
//  1) content.js MAIN world'de calisir -> loglari gormek icin DevTools'ta
//     Console sekmesindeki "context" acik menusu "top" yerine
//     "MYYT ... /content.js" (extension sayfasi) secilmelidir.
//  2) Kolaylik icin ayni loglar window.postMessage ile bridge.js'e de
//     iletilir; oradan chrome-extension://.../background.html sayfasinin
//     console'una ("[MYYT-BG-PAGE]") yazilir -> context degistirmeden
//     takip edebilirsin.
//  3) Sayfada sag altta canli bir HUD kutusu var: son olaylar ve
//     reklam/skip butonu durumunu gozle gorebilirsin.
// ============================================================
const dbgLog = function (...args) {
    if (!debugMode) return;
    console.log("🚀 MYYT [content]", ...args);
    try {
        window.postMessage({ source: "MYYT_LOG", args: args.map(String) }, "*");
    } catch (e) { /* onemsiz */ }
};

if (debugMode) {
    dbgLog("✅ content.js YUKLENDI (MAIN world). Sayfa:", location.href);
}

// tracking variables
const defaultInt = 1500;

// current video status
let videoStatus = 0;

// ============================================================
// DEBUG HUD - sayfanin sag altinda canli durum kutusu.
// En azindan bir kez log uretirse KUTU GORUNUR; kutuyu yazi
// tahtasina kopyalamak icin icine tiklayabilirsin.
// Kapatmak icin: window.__MYYT_HIDE_HUD__() konsolda calistir.
// ============================================================
let hudEl = null;
let hudLines = [];

const updateHud = function (statusText) {
    if (!debugMode) return;
    try {
        if (!hudEl || !document.body.contains(hudEl)) {
            hudEl = document.createElement("div");
            hudEl.id = "myyt-debug-hud";
            hudEl.style.cssText = [
                "position:fixed", "right:12px", "bottom:12px", "z-index:2147483647",
                "background:rgba(0,0,0,.85)", "color:#0f0",
                "font:12px/1.5 monospace", "padding:8px 10px", "border-radius:8px",
                "max-width:360px", "white-space:pre-wrap", "pointer-events:auto",
            ].join(";");
            hudEl.addEventListener("click", () => {
                const text = hudEl.textContent;
                try { navigator.clipboard.writeText(text); } catch (e) { /* ok */ }
            });
            document.body.appendChild(hudEl);
        }
        const now = new Date().toLocaleTimeString();
        hudLines.push("[" + now + "] " + statusText);
        if (hudLines.length > 8) hudLines.shift();
        hudEl.textContent = "🚀 MYYT DEBUG\n" + hudLines.join("\n");
    } catch (e) { /* sayfa hazir degil */ }
};

window.__MYYT_HIDE_HUD__ = function () {
    if (hudEl) { hudEl.remove(); hudEl = null; }
};

// time converter
const convertSeconds = function (currentDuration) {
    const hours = Math.floor(currentDuration / 3600);
    const minutes = Math.floor((currentDuration - (hours * 3600)) / 60);
    const seconds = currentDuration - (hours * 3600) - (minutes * 60);

    return hours.toString().padStart(2, '0') + ':' +
        minutes.toString().padStart(2, '0') + ':' +
        seconds.toString().padStart(2, '0');
};

// queryselectoroneof method
const querySelectorOneOf = function (...selectorArgs) {
    let selectors = document.querySelectorAll(selectorArgs.join(","));

    let element = null;
    for (const selector of selectors) {
        if (!!selector) element = selector;
    }

    return element;
};

// ============================================================
// YouTube butonlari artik .click() ile tetiklenmiyor.
// YouTube'un kendi player kodu, tiklama olayinin "trusted"
// (gercek kullani tiklamasi) olmasini istiyor. Bu yuzden
// element.click() yerine, DOM spec'ine uygun bir MouseEvent
// dizisi (pointerdown -> mousedown -> pointerup -> mouseup
// -> click) gonderiyoruz. Bunu content script'ten yaptigimiz
// icin olay yine untrusted kalir; bu durumda asagidaki
// dispatchTrustedClickFallback devreye girer ve tıklamayı
// extension'in arka planindaki "user action" API'si ile
// (chrome.debugger / CDP Input.dispatchMouseEvent) gercek
// bir tiklama olarak YouTube'a iletir.
// ============================================================

const dispatchDomClickSequence = function (el) {
    const rect = el.getBoundingClientRect();
    // Butonun merkezi (viewport koordinatlari)
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const baseProps = {
        bubbles: true,
        cancelable: true,
        composed: true,          // shadow DOM'dan disariya ulasin
        view: window,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 0,
        buttons: 1,
    };

    // Sadece element.click() gondermek yetmiyor; YouTube'un
    // dinleyicileri pointer/mouse event'lerini de kontrol ediyor.
    const events = [
        ["pointerdown", PointerEvent],
        ["mousedown", MouseEvent],
        ["pointerup", PointerEvent],
        ["mouseup", MouseEvent],
        ["click", MouseEvent],
    ];

    for (const [type, Ctor] of events) {
        const ev = new Ctor(type, {
            ...baseProps,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            detail: type === "click" || type.includes("mouse") ? 1 : 0,
        });
        el.dispatchEvent(ev);
    }

    return { x, y };
};

// Content script'ten trusted tiklama uretilemeyecegi icin, koordinatlari
// background'a bildirip orada CDP (chrome.debugger) ile gercek tiklama
// attiriyoruz.
//
// DIKKAT: Bu dosya manifest'te "world": "MAIN" ile yuklendigi icin YouTube'un
// kendi JavaScript ortaminca calisir ve `chrome.runtime` burada MEVCUT DEGILDIR
// (`chrome is not defined` hatasi alinirdi). Bu yuzden mesajlasma
// window.postMessage koprusu uzerinden yapilir; asil `chrome.runtime.sendMessage`
// cagrisini izole content script (bridge.js) yapar.
const requestRealClick = function (x, y) {
    const payload = { type: "REAL_CLICK_REQUEST", x: x, y: y };

    // 1) Extension'in MAIN world uzantisi varsa (Chrome 118+) dogrudan gonder.
    if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
        try {
            dbgLog("📤 REAL_CLICK gonderildi: chrome.runtime.sendMessage (MAIN world), koordinat:", x.toFixed(1), y.toFixed(1));
            updateHud("📤 trusted click istegi gonderildi (" + x.toFixed(0) + "," + y.toFixed(0) + ")");
            chrome.runtime.sendMessage(payload, (resp) => {
                if (chrome.runtime.lastError) {
                    dbgLog("❌ sendMessage hata:", chrome.runtime.lastError.message);
                    updateHud("❌ sendMessage: " + chrome.runtime.lastError.message);
                } else {
                    dbgLog("📥 background cevabi:", JSON.stringify(resp));
                    updateHud("📥 bg cevap: " + JSON.stringify(resp));
                }
            });
            return;
        } catch (e) { /* asaagi fall back */ }
    }

    // 2) Fallback: bridge.js'in dinledigi CustomEvent + postMessage koprusu.
    document.dispatchEvent(new CustomEvent("MYYT_REAL_CLICK", { detail: payload }));
    try {
        window.postMessage({ source: "MYYT_CONTENT", ...payload }, "*");
        dbgLog("📤 REAL_CLICK gonderildi: postMessage koprusu uzerinden, koordinat:", x.toFixed(1), y.toFixed(1));
        updateHud("📤 trusted click (kopru) gonderildi (" + x.toFixed(0) + "," + y.toFixed(0) + ")");
    } catch (e) {
        dbgLog("❌ postMessage hatasi:", e);
    }
};

// Background'dan (bridge uzerinden) gelen cevaplari dinle - koklama zincirinin
// son halkasini da gorebilesin.
window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== "MYYT_BG_RESULT") return;
    dbgLog("📥 KOPRU cevabi (bg -> content):", JSON.stringify(data.result));
    updateHud("📥 bg->koyru: " + JSON.stringify(data.result));
});

const skipAdButton = function (targetNode) {
    dbgLog("🖱️ skipAdButton CALISTI. Buton HTML:", targetNode.outerHTML.slice(0, 200));

    const pos = dispatchDomClickSequence(targetNode);
    dbgLog("   → sentetik event dizisi gonderildi (untrusted), merkez:", pos.x.toFixed(1), pos.y.toFixed(1));

    // Eski davranisi da koruyoruz: bazi surumlerde .click() hala ise yariyor
    targetNode.click();
    dbgLog("   → element.click() cagrildi (bu genelde YouTube'da ise yaramaz)");

    // Asil cozum: background uzerinden trusted tiklama
    requestRealClick(pos.x, pos.y);
};

// main loop: follow skip button only
let tickCount = 0;
setInterval(() => {
    tickCount++;

    // ads video is playing right now
    let adPlaying = querySelectorOneOf(".ytp-visit-advertiser-link.ytp-ad-component--clickable", ".ytp-ad-visit-advertiser-button");

    // ads video is a counter or video plays soon
    let countTime = querySelectorOneOf(".ytp-ad-text.ytp-ad-preview-text-modern", ".ytp-skip-ad-button");

    // video progress bar
    let moviePlayer = document.getElementsByClassName('video-stream');
    let progressBar = document.querySelector(".ytp-progress-bar");

    // DEBUG: her tikta kisa durum satiri (reklam var mi, buton var mi)
    const dbgTarget = querySelectorOneOf(".ytp-skip-ad-button", ".ytp-ad-skip-button-modern.ytp-button");
    const dbgBtnVisible = !!dbgTarget && !!(dbgTarget.offsetParent || dbgTarget.getClientRects().length);
    if (debugMode && (tickCount % 4 === 1 || dbgBtnVisible)) {
        dbgLog("⏱️ tick#" + tickCount,
            "| reklam:", adPlaying ? "VAR" : "yok",
            "| sayac:", countTime ? "VAR" : "yok",
            "| skipButon:", dbgTarget ? ("VAR gorunur=" + dbgBtnVisible) : "yok",
            "| videoStatus:", videoStatus);
    }

    // check video data
    if (!!moviePlayer && moviePlayer.length > 0) {
        let playerCurrentTime = Math.floor(moviePlayer[0].currentTime);
        let videoTotalTime = parseInt(progressBar?.getAttribute("aria-valuemax"));
        videoTotalTime = Math.max(1, videoTotalTime - 3);

        if (
            videoStatus == 0
            && adPlaying === null
            && videoTotalTime > 0
            && playerCurrentTime >= videoTotalTime
        ) {
            videoStatus = 1; // finished

            dbgLog("🏁 Video BITTI sayildi (status 0->1). sure:", playerCurrentTime, "/", videoTotalTime);
            updateHud("🏁 status=1 (video bitti)");
        }

        if (
            videoStatus != 0
            && adPlaying === null
            && videoTotalTime > 0
            && playerCurrentTime < videoTotalTime
        ) {
            videoStatus = 0; // reset

            dbgLog("🔄 Video status sifirlandi (->0). sure:", playerCurrentTime, "/", videoTotalTime);
        }

        if (debugMode) dbgLog("   video suresi:", convertSeconds(playerCurrentTime), "/", convertSeconds(videoTotalTime));
    } else if (debugMode && tickCount % 20 === 1) {
        dbgLog("⚠️ .video-stream elementi bulunamadi (player yok mu?)");
    }

    // check ads video ready to skip
    if (!!adPlaying && !!countTime) {
        dbgLog("📺 REKLAM AKTIF. Ad:", adPlaying.getAttribute("aria-label"), "| Sayac:", countTime.textContent);
        updateHud("📺 reklam aktif, sayac: " + countTime.textContent);

        if (!!progressBar) {
            dbgLog("   progressbar:", progressBar.getAttribute("aria-valuemin"), "-", progressBar.getAttribute("aria-valuenow"), "-", progressBar.getAttribute("aria-valuemax"));
        }

        if (videoStatus == 1) {
            videoStatus = 2; // status update after video ads
            dbgLog("⏩ videoStatus 1->2 (reklam-sonrasi mod)");
            updateHud("⏩ status=2 (reklam-sonrasi)");
        }
    }

    // skip button after a long timeeeees waiting (5 seconds)
    let targetNode = querySelectorOneOf(".ytp-skip-ad-button", ".ytp-ad-skip-button-modern.ytp-button");
    if (!!targetNode && location.pathname === "/watch") {

        // find which skip adsbutton appears
        let oldStyleTargetNode = targetNode.classList.contains("ytp-skip-ad-button");

        // check ads skip or not
        let autoSkipAds = false;
        if (videoStatus == 2) {
            autoSkipAds = true;

            dbgLog("✅ AutoSkipAds karari: VideoStatus==2");
        } else if (oldStyleTargetNode && targetNode.getAttribute("style") != "display: none;") {
            autoSkipAds = true;

            dbgLog("✅ AutoSkipAds karari: OldStyleTargetNode, style=", targetNode.getAttribute("style"));
        } else if (!oldStyleTargetNode && !!targetNode?.parentElement && targetNode.parentElement.getAttribute("style") != "display: none;") {
            autoSkipAds = true;

            dbgLog("✅ AutoSkipAds karari: ParentElement, style=", targetNode.parentElement.getAttribute("style"));
        } else {
            dbgLog("⛔ Skip butonu VAR ama autoSkipAds=false. oldStyle:", oldStyleTargetNode,
                "| btn style:", targetNode.getAttribute("style"),
                "| parent style:", targetNode.parentElement?.getAttribute("style"));
        }

        if (autoSkipAds) {
            dbgLog("🎯 100ms sonra skipAdButton() cagrilacak. Buton:", targetNode.className);
            setTimeout(() => {
                // wait and click ads skip button
                skipAdButton(targetNode);

                // reset video status
                videoStatus = 0;

                dbgLog("🧹 videoStatus sifirlandi (0)");
            }, 100);
        }
    } else if (targetNode && debugMode) {
        dbgLog("ℹ️ Skip butonu bulundu ama pathname '/watch' DEGIL:", location.pathname);
    }

}, defaultInt);
