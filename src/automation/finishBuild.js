const blueBoxDetector = require('../detection/blueBoxDetector');
const redBlobDetector = require('../detection/redBlobDetector');

/*
Protocol for Finish Build Automation:
1.  Detect blue build box (with a 2-second retry loop until found).
2.  Start of main loop (each call to runBuildProtocol from main.js).
3.  Click and hold on the middle of the blue build box for 5 seconds (release any prior hold first).
4.  Check for presence or absence of the named "research blob"
    4a. If absent, continue click-holding and go back to #2 (the current 5-second hold continues, and the next loop iteration will process it).
    4b. If present, stop click-holding on build.
5.  Click on "open/close research" (CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW).
6.  Click on "individual research" (CLICK_AREAS.INDIVIDUAL_RESEARCH) 10x rapidly, with 100ms delay between clicks.
7.  Click on "open/close research" (CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW).
8.  After completing research clicks, immediately initiate a new 5-second click-hold on the blue build box, then go back to #2 (the hold persists until the next loop iteration in main.js).
*/

// These are global within this module but managed by main.js through setters/getters
let blueBoxCoords = null; // Store blue box coordinates for repeated clicks
let lastBlueBoxFound = false; // New flag to track if a blue box was found in the previous cycle
let holdStartTime = null; // New variable to track when the current 5-second hold started

function resetAutomationState() {
  blueBoxCoords = null; // Ensure blue box is re-detected after pause/stop
  lastBlueBoxFound = false; // Ensure blue box is re-detected after pause/stop
  holdStartTime = null; // Reset hold start time
}

// Function to find blue box click coordinates
async function findAndGetBlueBoxClickCoordinates(imageDataUrl, captureRegion) {
    try {
        console.log('Attempting to find blue box click coordinates...', { captureRegion });
        const detections = await blueBoxDetector.detect(imageDataUrl, captureRegion);

        if (detections && detections.length > 0) {
            const firstBlueBox = detections[0];
            const clickX = Math.round(firstBlueBox.x + firstBlueBox.width / 2);
            const clickY = Math.round(firstBlueBox.y + firstBlueBox.height / 2);
            console.log(`Found blue box at (${firstBlueBox.x}, ${firstBlueBox.y}) with dimensions ${firstBlueBox.width}x${firstBlueBox.height}. Calculated click coordinates: (${clickX}, ${clickY})`);
            return { x: clickX, y: clickY };
        } else {
            console.log('No blue boxes detected.');
            return null;
        }
    } catch (error) {
        console.error('Error in findAndGetBlueBoxClickCoordinates:', error);
        return null;
    }
}

async function runBuildProtocol(dependencies) {
    const { 
        performClick, 
        clickDown,
        clickUp,
        performRapidClicks,
        CLICK_AREAS,
        redBlobDetectorDetect,
        detectBlueBoxes, // Corrected dependency name
        captureScreenRegion,
        updateStatus,
        iphoneMirroringRegion,
        setlastBlueBoxClickCoords,
        setIsHoldingBlueBox,
        getIsHoldingBlueBox,
    } = dependencies;

    try {
        console.log(`DEBUG: runBuildProtocol started. blueBoxCoords: ${JSON.stringify(blueBoxCoords)}, isHoldingBlueBox: ${getIsHoldingBlueBox()}, lastBlueBoxFound: ${lastBlueBoxFound}, holdStartTime: ${holdStartTime}`);

        // PROTOCOL Step 1: Detect blue build box (with a 2-second retry loop until found)
        if (!blueBoxCoords || !lastBlueBoxFound) {
            updateStatus('Detecting blue build box...', 'info');
            while (!blueBoxCoords || !lastBlueBoxFound) { // Retry loop for blue box detection
                const fullScreenDataUrl = await captureScreenRegion();
                if (!fullScreenDataUrl) {
                    updateStatus('Failed to capture screen region for blue box detection.', 'error');
                    console.error('ERROR: Failed to capture screen region for blue box detection.');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying capture
                    continue;
                }

                const detections = await detectBlueBoxes(fullScreenDataUrl, iphoneMirroringRegion);
                if (detections && detections.length > 0) {
                    const firstBlueBox = detections[0];
                    blueBoxCoords = {
                        x: Math.round(firstBlueBox.x + firstBlueBox.width / 2),
                        y: Math.round(firstBlueBox.y + firstBlueBox.height / 2),
                    };
                    setlastBlueBoxClickCoords(blueBoxCoords); // Update main process's stored coords
                    updateStatus(`Blue box detected at X:${blueBoxCoords.x}, Y:${blueBoxCoords.y}`, 'success');
                    console.log(`DEBUG: Blue box detected and coords set: ${JSON.stringify(blueBoxCoords)}`);
                    lastBlueBoxFound = true;
                    break; // Exit retry loop
                } else {
                    updateStatus('No blue boxes detected. Retrying in 2 seconds...', 'info');
                    console.log('DEBUG: No blue box found after detection, retrying in 2 seconds.');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying detection
                }
            }

            if (!blueBoxCoords) { // If after retries, blue box is still not found
                updateStatus('Automation cannot start: Blue box never found.', 'error');
                console.log('DEBUG: Blue box never found after retries, automation cannot proceed.');
                // If blue box not found, and we were holding, release the hold.
                if (getIsHoldingBlueBox() && clickUp && blueBoxCoords) {
                    console.log('DEBUG: Releasing click-hold due to no blue box detection during initial detect.');
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await clickUp(blueBoxCoords.x, blueBoxCoords.y);
                    setIsHoldingBlueBox(false);
                    updateStatus('Released click-hold due to no blue box detection.', 'info');
                }
                lastBlueBoxFound = false;
                return; // Cannot proceed without a blue box, will implicitly re-attempt detection on next interval
            }
        }

        // AT THIS POINT: blueBoxCoords is guaranteed to be valid and lastBlueBoxFound is true.

        // PROTOCOL Step 3: Click and hold on the middle of the blue build box for 5 seconds (non-blocking)
        const currentTime = Date.now();

        if (!getIsHoldingBlueBox()) {
            // Initiate a new 5-second click-hold (this is the very first hold, or after a research cycle)
            updateStatus('Initiating 5-second click-hold on blue box.', 'info');
            console.log(`DEBUG: Initiating 5-second click-hold at (${blueBoxCoords.x}, ${blueBoxCoords.y}).`);
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before clickDown
            await clickDown(blueBoxCoords.x, blueBoxCoords.y);
            setIsHoldingBlueBox(true);
            holdStartTime = currentTime; // Record the start time of the hold
            setlastBlueBoxClickCoords(blueBoxCoords); // Important for mouse interruption to release
            console.log(`DEBUG: 5-second click-hold started. isHoldingBlueBox: ${getIsHoldingBlueBox()}, holdStartTime: ${holdStartTime}`);
            return; // Return to allow the hold to run for 5 seconds. The setInterval will call again.

        } else if ((currentTime - holdStartTime) < 5000) {
            // Click-hold is ongoing and less than 5 seconds has passed, continue holding
            console.log(`DEBUG: Click-hold ongoing, ${currentTime - holdStartTime}ms elapsed. Continuing hold.`);
            return; // Return to continue the hold. The setInterval will call again.

        } else { // getIsHoldingBlueBox() is true and (currentTime - holdStartTime) >= 5000
            // 5 seconds of click-hold has passed, proceed to research check
            updateStatus('5-second click-hold complete. Proceeding to research check.', 'info');
            console.log('DEBUG: 5-second click-hold elapsed. Proceeding to research check.');

            // PROTOCOL Step 4: Check for presence or absence of the named "research blob"
            updateStatus('Checking for research blob...', 'info');
            console.log('DEBUG: Capturing screen for research blob detection.');
            const currentScreenDataUrl = await captureScreenRegion();
            const redBlobDetections = await redBlobDetectorDetect(currentScreenDataUrl, iphoneMirroringRegion);
            const researchBlobFound = redBlobDetections.some(blob => blob.name === "research blob");
            console.log(`DEBUG: Research blob found: ${researchBlobFound}. Current isHoldingBlueBox: ${getIsHoldingBlueBox()}`);

            if (researchBlobFound) {
                // PROTOCOL Step 4b: if present, stop click-holding on build
                console.log('DEBUG: Research blob IS present. Handling research cycle.');
                if (getIsHoldingBlueBox() && blueBoxCoords) {
                    updateStatus('Research blob present. Releasing click-hold on blue box.', 'info');
                    console.log(`DEBUG: Attempting to call clickUp(${blueBoxCoords.x}, ${blueBoxCoords.y}).`);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await clickUp(blueBoxCoords.x, blueBoxCoords.y);
                    setIsHoldingBlueBox(false);
                    updateStatus('Click-hold on blue box released.', 'success');
                }

                // PROTOCOL Step 5: Click on "open/close research"
                updateStatus('Clicking open/close research window.', 'info');
                await performClick(CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.x, CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.y);
                await new Promise(resolve => setTimeout(resolve, 100));

                // PROTOCOL Step 6: Click on "individual research" 10x rapidly, with 100ms delay between clicks
                updateStatus('Performing rapid clicks on individual research.', 'info');
                for (let i = 0; i < 10; i++) {
                    await performClick(CLICK_AREAS.INDIVIDUAL_RESEARCH.x, CLICK_AREAS.INDIVIDUAL_RESEARCH.y);
                    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between clicks
                }
                await new Promise(resolve => setTimeout(resolve, 100)); // Short delay after rapid clicks

                // PROTOCOL Step 7: Click on "open/close research"
                updateStatus('Clicking open/close research window again.', 'info');
                await performClick(CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.x, CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.y);
                await new Promise(resolve => setTimeout(resolve, 100));

                // PROTOCOL Step 8: After completing research clicks, immediately initiate a new 5-second click-hold on the blue build box, then go back to #2
                updateStatus('Research cycle complete. Initiating next 5-second click-hold on blue box.', 'success');
                console.log('DEBUG: Research cycle complete. Initiating next 5-second click-hold immediately.');

                // First, ensure any previous hold is released before initiating the new one
                if (getIsHoldingBlueBox() && blueBoxCoords) {
                    updateStatus('Releasing previous click-hold before new post-research 5-second hold.', 'info');
                    console.log(`DEBUG: Releasing previous click-hold at (${blueBoxCoords.x}, ${blueBoxCoords.y}) after research.`);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await clickUp(blueBoxCoords.x, blueBoxCoords.y);
                    setIsHoldingBlueBox(false);
                }

                // Immediately initiate a new 5-second click-hold for the next cycle
                updateStatus('Initiating new 5-second click-hold on blue box for next cycle.', 'info');
                console.log(`DEBUG: Initiating new 5-second click-hold at (${blueBoxCoords.x}, ${blueBoxCoords.y}) for next cycle.`);
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before clickDown
                await clickDown(blueBoxCoords.x, blueBoxCoords.y);
                setIsHoldingBlueBox(true);
                holdStartTime = currentTime; // Record the start time of this new hold
                setlastBlueBoxClickCoords(blueBoxCoords); // Important for mouse interruption to release
                console.log(`DEBUG: New 5-second click-hold started. isHoldingBlueBox: ${getIsHoldingBlueBox()}, holdStartTime: ${holdStartTime}`);

            } else {
                // PROTOCOL Step 4a: if absent, go back to #2 (continue click-holding)
                console.log('DEBUG: Research blob IS NOT present. Click-hold remains active for next cycle.');
                updateStatus('Research blob absent. Continuing 5-second click-hold on blue box.', 'info');
                // The hold continues. We need to reset holdStartTime to restart the 5-second countdown for the next cycle's check
                holdStartTime = currentTime; // Reset holdStartTime to now to ensure a fresh 5s hold for the next cycle
            }
        }

    } catch (error) {
        console.error('Error in runBuildProtocol:', error);
        updateStatus(`Protocol error: ${error.message}`, 'error');
        if (getIsHoldingBlueBox() && blueBoxCoords) {
            await new Promise(resolve => setTimeout(resolve, 50));
            await clickUp(blueBoxCoords.x, blueBoxCoords.y);
        }
        setIsHoldingBlueBox(false);
        blueBoxCoords = null;
        setlastBlueBoxClickCoords(null);
        lastBlueBoxFound = false;
        holdStartTime = null; // Reset hold start time on error
    }
}

module.exports = { runBuildProtocol, resetAutomationState, findAndGetBlueBoxClickCoordinates };
