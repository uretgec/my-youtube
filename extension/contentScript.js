"use strict";

// debug
const debugMode = false
if (debugMode) console.debug("DEBUGMYYT", "Debug mode is live.")

// tracking variables
let observerActive = false
const defaultInt = 1000

// observer config
const config = {
    attributes: true,
    attributeFilter: ["style"],
    attributeOldValue: true,
    childList: false,
    subtree: false,
    characterData: true
}

// observer calback func
const callback = (mutations, obs) => {  
    mutations.forEach(mutation => {
        if (debugMode) console.debug("DEBUGMYYT", "Mutation:", mutation, mutation.target.textContent)

        if(mutation.oldValue == "display: none;") {
            if (debugMode) console.debug("DEBUGMYYT", "Skip button is visible.", mutation.target.textContent)

            setTimeout(() => {
                // wait and click ads skip button
                mutation.target.click()

                // stop observer
                // NOTE: No need to disconnect after every click action. 
                // via: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/observe
                // obs.disconnect()

                // stop current process
                observerActive = false

                if (debugMode) console.debug("DEBUGMYYT", "Skip button clicked and process stopped.")
            }, 250)
        }
    })
}

// init observer
const observer = new MutationObserver(callback)

// main loop: follow skip button only
setInterval(() => {
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
    if(!!targetNode?.parentElement && !observerActive) {

        // follow the target node
        observer.observe(targetNode?.parentElement, config)

        // start current process
        observerActive = true

        if (debugMode) console.debug("DEBUGMYYT", "Observer activated", targetNode)
    }

    if (debugMode) console.debug("DEBUGMYYT", "Result:", targetNode?.parentElement, observerActive)

}, defaultInt)