"use strict";

// debug
const debugMode = false
if (debugMode) console.debug("DEBUGMYYT", "Debug mode is live.")

// tracking variables
const defaultInt = 1500

// current video status
let videoStatus = 0

// time converter
const convertSeconds = function(currentDuration) {
    // currentDuration = Math.floor(currentDuration)
    const hours = Math.floor(currentDuration / 3600)
    const minutes = Math.floor((currentDuration - (hours * 3600)) / 60)
    const seconds = currentDuration - (hours * 3600) - (minutes * 60)

    return hours.toString().padStart(2, '0') + ':' +
        minutes.toString().padStart(2, '0') + ':' +
        seconds.toString().padStart(2, '0')
}

// queryselectoroneof method
const querySelectorOneOf = function(...selectorArgs) {
    let selectors = document.querySelectorAll(selectorArgs.join(","))

    let element = null
    for (const selector of selectors) {
        if (!!selector) element = selector
    }

    return element
}

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
    let adPlaying = querySelectorOneOf(".ytp-visit-advertiser-link.ytp-ad-component--clickable", ".ytp-ad-visit-advertiser-button")

    // ads video is a counter or video plays soon
    let countTime = document.getElementsByClassName("ytp-ad-text ytp-ad-preview-text-modern")

    // video progress bar
    let moviePlayer = document.getElementsByClassName('video-stream')
    let progressBar = document.querySelector(".ytp-progress-bar")

    // check video data
    if (!!moviePlayer) {
        let playerCurrentTime = Math.floor(moviePlayer[0].currentTime)
        let videoTotalTime = parseInt(progressBar?.getAttribute("aria-valuemax"))
        videoTotalTime = videoTotalTime - 3

        if (
            videoStatus == 0
            && adPlaying === null
            && videoTotalTime > 0 
            && playerCurrentTime >= videoTotalTime
        ) {
            videoStatus = 1 // finished

            if (debugMode) console.debug("DEBUGMYYT", "Video finished!!!!!!!!!!!!!")
        }

        if (
            videoStatus != 0
            && adPlaying === null
            && videoTotalTime > 0 
            && playerCurrentTime < videoTotalTime
        ) {
            videoStatus = 0 // reset

            if (debugMode) console.debug("DEBUGMYYT", "Video status reset!!!!!!!!!!!!!")
        }

        if (debugMode) console.debug("DEBUGMYYT", "Video Current Time:", playerCurrentTime, convertSeconds(playerCurrentTime), "Video Duration Time:", videoTotalTime)
    }

    // check ads video ready to skip
    if (!!adPlaying && !!countTime) {
        if (debugMode) console.debug("DEBUGMYYT", "Ads Name:", adPlaying.getAttribute("aria-label"), "Count Time:", countTime[0].textContent)

        if (!!progressBar) {
            if (debugMode) console.debug("DEBUGMYYT", "Progress Bar:", progressBar?.getAttribute("aria-valuemin"), " - ", progressBar?.getAttribute("aria-valuenow"), " - ", progressBar?.getAttribute("aria-valuemax"))
        }

        if (videoStatus == 1) {
            videoStatus = 2 // status update after video ads
        }
    }

    // skip button after a long timeeeees waiting (5 seconds)
    let targetNode = querySelectorOneOf(".ytp-skip-ad-button",".ytp-ad-skip-button-modern.ytp-button")
    if (
        !!targetNode 
        && !!targetNode?.parentElement 
        && (targetNode.parentElement.getAttribute("style") != "display: none;" || videoStatus == 2)
        && location.pathname === "/watch"
    ) {

        setTimeout(() => {
            // wait and click ads skip button
            targetNode.click()

            // reset video status
            videoStatus = 0

            if (debugMode) console.debug("DEBUGMYYT", "Skip button clicked and process stopped.", "Video Status:", videoStatus)
        }, 100)

        if (debugMode) console.debug("DEBUGMYYT", "Target Ads Node", targetNode)
    }

    if (debugMode) console.debug("DEBUGMYYT", "Result:", targetNode?.parentElement, "Video Status:", videoStatus)

}, defaultInt)
