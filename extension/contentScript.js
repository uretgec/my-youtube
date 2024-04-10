"use strict";

// debug
const debugMode = false
if (debugMode) console.debug("DEBUGMYYT", "Debug mode is live.")

// tracking variables
const defaultInt = 1500

// main loop: follow skip button only
setInterval(() => {
    // video pause confirmation popup
    let pauseConfirmationPopup = document.getElementById("confirm-button")

    // check button is here and click the "Yes" button
    if (!!pauseConfirmationPopup) {
        pauseConfirmationPopup.querySelector("button")?.click()

        if (debugMode) console.debug("DEBUGMYYT", "Confirmation button clicked.")
    }

    // ads video is playing right now
    let adPlaying = document.querySelector(".ytp-ad-visit-advertiser-button")

    // ads video is a counter or not
    let countTime = document.getElementsByClassName("ytp-ad-text ytp-ad-preview-text-modern")

    // check ads video ready to skip
    if (!!adPlaying && !!countTime) {
        if (debugMode) console.debug("DEBUGMYYT", "Ads Name:", adPlaying.getAttribute("aria-label"), "Count Time:", countTime[0].textContent)
    }

    // skip button after a long timeeeees waiting (5 seconds)
    let targetNode = document.querySelector(".ytp-ad-skip-button-modern.ytp-button")
    if (
        !!targetNode 
        && !!targetNode?.parentElement 
        && targetNode.parentElement.getAttribute("style") != "display: none;"
        && location.pathname === "/watch"
    ) {

        setTimeout(() => {
            // wait and click ads skip button
            targetNode.click()

            if (debugMode) console.debug("DEBUGMYYT", "Skip button clicked and process stopped.")
        }, 250)

        if (debugMode) console.debug("DEBUGMYYT", "Observer activated", targetNode)
    }

    if (debugMode) console.debug("DEBUGMYYT", "Result:", targetNode?.parentElement)

}, defaultInt)