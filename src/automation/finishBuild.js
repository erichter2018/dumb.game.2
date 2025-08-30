const blueBoxDetector = require('../detection/blueBoxDetector');
const redBlobDetector = require('../detection/redBlobDetector');

/*
Protocol for Finish Build Automation (Simplified):
1.  Call a function to check blue build box until one is found, retrying every 2 seconds.
2.  Start an infinite loop.
3.  Inside the loop, call a function to hold down the mouse in the middle of the blue box for 5 seconds (this is a blocking call).
4.  Call a function to check for the research blob.
    a. If the research blob is found, call a function to perform the research actions (click open/close research, 10x rapid clicks on individual research, click open/close research again).
    b. If the research blob is not found, the loop simply continues, implicitly maintaining the click-hold for the next iteration.
5.  The loop then starts over (Step 2).
*/

// These are global within this module but managed by main.js through setters/getters
let blueBoxCoords = null; // Store blue box coordinates for repeated clicks
let lastBlueBoxFound = false; // New flag to track if a blue box was found in the previous cycle

function resetAutomationState() {
  blueBoxCoords = null; // Ensure blue box is re-detected after pause/stop
  lastBlueBoxFound = false; // Ensure blue box is re-detected after pause/stop
}

async function stopAutomation(dependencies) {
    const { updateStatus, setIsHoldingBlueBox, clickUp, getlastBlueBoxClickCoords, setlastBlueBoxClickCoords } = dependencies;

    updateStatus('Stopping automation cleanly...', 'info');
    console.log('DEBUG: Attempting to release any active click-hold during stop.');
    if (setIsHoldingBlueBox && getlastBlueBoxClickCoords()) {
        const coords = getlastBlueBoxClickCoords();
        await new Promise(resolve => setTimeout(resolve, 50));
        await clickUp(coords.x, coords.y);
        setIsHoldingBlueBox(false);
        setlastBlueBoxClickCoords(null);
    }
    resetAutomationState();
    updateStatus('Automation stopped.', 'info');
    console.log('DEBUG: Automation stopped and state reset.');
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

async function holdBlueBox(coords, duration, dependencies) {
    const { clickDown, clickUp, setIsHoldingBlueBox, setlastBlueBoxClickCoords, updateStatus, clickAndHold, getIsAutomationRunning } = dependencies;
    
    if (!coords || coords.x === null || coords.y === null) {
        console.error('ERROR: Attempted to hold blue box with null or invalid coordinates.', coords);
        updateStatus('Error: Attempted to hold blue box with invalid coordinates.', 'error');
        setIsHoldingBlueBox(false);
        return; // Exit if coordinates are invalid
    }

    updateStatus(`Initiating ${duration / 1000}-second click-hold at (${coords.x}, ${coords.y}).`, 'info');
    console.log(`DEBUG: Initiating ${duration / 1000}-second click-hold at (${coords.x}, ${coords.y}).`);
    
    setlastBlueBoxClickCoords(coords); // Store coords to be able to release on interruption
    setIsHoldingBlueBox(true); // Indicate that a click-hold is active
    
    // Use the interruptible clickAndHold from main.js
    await clickAndHold(coords.x, coords.y, duration, getIsAutomationRunning);
    
    console.log('DEBUG: Releasing click-hold at ' + (coords ? `(${coords.x}, ${coords.y})` : 'null') + '.');
    setIsHoldingBlueBox(false); // Indicate that click-hold is no longer active
}

async function checkResearchBlob(dependencies) {
    const { updateStatus, redBlobDetectorDetect, captureScreenRegion, iphoneMirroringRegion, getIsAutomationRunning } = dependencies;

    if (!getIsAutomationRunning()) {
        updateStatus('Automation stopped during research blob detection.', 'warn');
        return false;
    }

    updateStatus('Capturing screen for research blob detection.', 'info');
    console.log('DEBUG: Capturing screen for research blob detection.');

    const fullScreenDataUrl = await captureScreenRegion();
    if (!fullScreenDataUrl) {
        console.error('ERROR: Failed to capture screen region for research blob detection.');
        return false;
    }

    const detections = await redBlobDetectorDetect(fullScreenDataUrl, iphoneMirroringRegion);

    const researchBlobFound = detections.some(blob => blob.name === 'research blob');
    console.log(`DEBUG: Research blob found: ${researchBlobFound}`);
    return researchBlobFound;
}

async function doResearch(dependencies) {
    const { performClick, performRapidClicks, CLICK_AREAS, updateStatus, getIsAutomationRunning } = dependencies;

    if (!getIsAutomationRunning()) {
        updateStatus('Automation stopped during research actions.', 'warn');
        return;
    }

    updateStatus('Performing research actions.', 'info');
    console.log('DEBUG: Performing research actions.');

    if (!getIsAutomationRunning()) { return; }
    await performClick(CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.x, CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.y);
    await new Promise(resolve => setTimeout(resolve, 200)); // Short delay after first click

    if (!getIsAutomationRunning()) { return; }
    await performRapidClicks(CLICK_AREAS.INDIVIDUAL_RESEARCH.x, CLICK_AREAS.INDIVIDUAL_RESEARCH.y, 10);
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay after rapid clicks

    if (!getIsAutomationRunning()) { return; }
    await performClick(CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.x, CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.y);
    await new Promise(resolve => setTimeout(resolve, 200)); // Short delay after last click

    updateStatus('Research cycle completed.', 'success');
    console.log('DEBUG: Research cycle completed.');
}

async function findBlueBoxWithRetry(dependencies) {
    const { captureScreenRegion, detectBlueBoxes, iphoneMirroringRegion, updateStatus, getIsAutomationRunning } = dependencies;
    let retries = 0;
    const maxRetries = 10; // For initial detection, retry a few times before giving up

    if (!getIsAutomationRunning()) {
        updateStatus('Automation stopped before blue box detection.', 'warn');
        return null;
    }

    while (getIsAutomationRunning()) {
        updateStatus('Detecting blue boxes...', 'info');
        console.log('DEBUG: Detecting blue boxes with Sharp...');

        if (!getIsAutomationRunning()) { // Check again inside the loop
            updateStatus('Automation stopped during blue box detection.', 'warn');
            return null;
        }

        const fullScreenDataUrl = await captureScreenRegion();
        if (!fullScreenDataUrl) {
            updateStatus('Failed to capture screen region for blue box detection. Retrying in 2 seconds...', 'error');
            console.error('ERROR: Failed to capture screen region for blue box detection.');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying capture
            continue;
        }

        const detections = await detectBlueBoxes(fullScreenDataUrl, iphoneMirroringRegion);

        if (detections && detections.length > 0) {
            const firstBlueBox = detections[0];
            const coords = {
                x: Math.round(firstBlueBox.x + firstBlueBox.width / 2),
                y: Math.round(firstBlueBox.y + firstBlueBox.height / 2),
            };
            updateStatus(`Blue box detected at X:${coords.x}, Y:${coords.y}`, 'success');
            console.log(`DEBUG: Blue box detected and coords set: ${JSON.stringify(coords)}`);
            blueBoxFound = true;
            return coords;
        } else {
            updateStatus('No blue boxes detected. Retrying in 2 seconds...', 'info');
            console.log('DEBUG: No blue box found, retrying in 2 seconds.');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying detection
        }
    }
    return null; // Should not be reached if loop exits with blueBoxFound = true
}

async function runBuildProtocol(dependencies) {
    const { updateStatus, getIsAutomationRunning } = dependencies;

    try {
        // Step 1: Call check blue build box until one is found, every 2 seconds
        blueBoxCoords = await findBlueBoxWithRetry(dependencies);
        if (!blueBoxCoords) {
            updateStatus('Automation cannot start: Blue box never found.', 'error');
            return; // Cannot proceed without a blue box
        }
        lastBlueBoxFound = true; // Mark as found for subsequent checks

        // Step 2: Start a loop
        while (getIsAutomationRunning()) {
            // Step 3: Call a function to hold down in the middle of the blue box for 5 seconds
            await holdBlueBox(blueBoxCoords, 5000, dependencies);

            // Step 4: Call another function to check research blob
            const researchBlobFound = await checkResearchBlob(dependencies);

            // Step 4a: if found, call function to do research (click research button, etc...)
            if (researchBlobFound) {
                await doResearch(dependencies);
            }
            // Step 4b: if absent, continue click hold (handled implicitly by the holdBlueBox function in next loop iteration)

            // Step 2: Start loop over (implicit, as it's an infinite while loop)
        }
    } catch (error) {
        console.error('Error in runBuildProtocol:', error);
        updateStatus(`Protocol error: ${error.message}`, 'error');
        // Ensure any active hold is released on error
        if (dependencies.getIsHoldingBlueBox() && blueBoxCoords && blueBoxCoords.x !== null && blueBoxCoords.y !== null) {
            await new Promise(resolve => setTimeout(resolve, 50));
            await dependencies.clickUp(blueBoxCoords.x, blueBoxCoords.y);
        }
        dependencies.setIsHoldingBlueBox(false);
        blueBoxCoords = null;
        dependencies.setlastBlueBoxClickCoords(null);
        lastBlueBoxFound = false;
    }
}

module.exports = { runBuildProtocol, resetAutomationState, findAndGetBlueBoxClickCoordinates };
