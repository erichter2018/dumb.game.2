const blueBoxDetector = require('../detection/blueBoxDetector');
const redBlobDetector = require('../detection/redBlobDetector');

/*
Protocol for Finish Build Automation (Simplified):
1.  Call a function to check blue build box until one is found, retrying every 2 seconds.
2.  Start an infinite loop.
3.  Inside the loop, call a function to hold down the mouse in the middle of the blue box for 5 seconds (this is a blocking call).
4.  Call a function to check for the research blob.
    a. If the research blob is found, call a function to perform the research actions (click open/close research, 25x rapid clicks on individual research, click open/close research again).
    b. If the research blob is not found, the loop simply continues, implicitly maintaining the click-hold for the next iteration.
5.  The loop then starts over (Step 2).
*/

// These are global within this module but managed by main.js through setters/getters
let blueBoxCoords = null; // Store blue box coordinates for repeated clicks
let consecutiveNoBoxDetections = 0; // New: Counter for consecutive cycles without detecting an active build box

const BLUE_BOX_PROXIMITY_THRESHOLD = 150; // Max distance in pixels between red blob and blue box center

function resetAutomationState() {
  blueBoxCoords = null; // Ensure blue box is re-detected after pause/stop
  consecutiveNoBoxDetections = 0; // Reset counter
}

    // Helper function to remove the 'image' property from blob objects for logging
    function omitImageFromLog(obj) {
        if (Array.isArray(obj)) {
            return obj.map(item => {
                const { image, ...rest } = item;
                return rest;
            });
        } else if (obj && typeof obj === 'object') {
            const { image, ...rest } = obj;
            return rest;
        }
        return obj;
    }

// Helper to check if two coordinate sets are similar within a tolerance
function areCoordsSimilar(coords1, coords2, tolerance = 10) {
    if (!coords1 || !coords2) return false;
    return Math.abs(coords1.x - coords2.x) <= tolerance &&
           Math.abs(coords1.y - coords2.y) <= tolerance;
}

// New helper to calculate distance between two points
function calculateDistance(coords1, coords2) {
    if (!coords1 || !coords2) return Infinity;
    const dx = coords1.x - coords2.x;
    const dy = coords1.y - coords2.y;
    return Math.sqrt(dx * dx + dy * dy);
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
            console.log(`Found blue box at (${firstBlueBox.x}, ${firstBlueBox.y}) with dimensions ${firstBlueBox.width}x${firstBlueBox.height}. Calculated click coordinates: (${clickX}, ${clickY}). Details: ${JSON.stringify(omitImageFromLog(firstBlueBox))}`);
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
    
    console.log(`DEBUG: Attempting to click down at (${coords.x}, ${coords.y}) for holdBlueBox.`); // New log
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
    console.log(`DEBUG: Red blob detections in checkResearchBlob: ${JSON.stringify(omitImageFromLog(detections))}`);

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
    await performRapidClicks(CLICK_AREAS.INDIVIDUAL_RESEARCH.x, CLICK_AREAS.INDIVIDUAL_RESEARCH.y, 25);
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay after rapid clicks

    if (!getIsAutomationRunning()) { return; }
    await performClick(CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.x, CLICK_AREAS.OPEN_CLOSE_RESEARCH_WINDOW.y);
    await new Promise(resolve => setTimeout(resolve, 200)); // Short delay after last click

    updateStatus('Research cycle completed.', 'success');
    console.log('DEBUG: Research cycle completed.');
}

async function findBlueBoxWithRetry(dependencies, originalRedBlobCoords) {
    const { captureScreenRegion, detectBlueBoxes, iphoneMirroringRegion, updateStatus, getIsAutomationRunning } = dependencies;
    
    const MAX_RETRIES = 3; // Maximum number of retries to find stable blue build
    let retryCount = 0; // New: Counter for retries

    if (!getIsAutomationRunning()) {
        updateStatus('Automation stopped before blue box detection.', 'warn');
        return null;
    }

    while (getIsAutomationRunning() && retryCount < MAX_RETRIES) { // Modified: Add retryCount condition
        updateStatus(`Detecting blue boxes (Attempt ${retryCount + 1}/${MAX_RETRIES})...`, 'info');
        console.log('DEBUG: Detecting blue boxes with Sharp...');

        if (!getIsAutomationRunning()) { // Check again inside the loop
            updateStatus('Automation stopped during blue box detection.', 'warn');
            return null;
        }

        // Add 200ms delay before first detection to ensure UI is stable
        if (retryCount === 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        const fullScreenDataUrl = await captureScreenRegion();
        if (!fullScreenDataUrl) {
            updateStatus('Failed to capture screen region for blue box detection. Retrying in 2 seconds...', 'error');
            console.error('ERROR: Failed to capture screen region for blue box detection.');
            retryCount++; // Increment retry count on capture failure
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retrying capture
            continue;
        }

        const detections = await detectBlueBoxes(fullScreenDataUrl, iphoneMirroringRegion);

        if (detections && detections.length > 0) {
            // Filter for relevant states: blue_build, grey_build, other_grey, grey_max
            const relevantBoxes = detections.filter(box =>
                (box.state === 'blue_build' ||
                box.state === 'grey_build' ||
                box.state === 'other_grey' ||
                box.state === 'grey_max') &&
                (originalRedBlobCoords ? calculateDistance(originalRedBlobCoords, { x: box.x + box.width / 2, y: box.y + box.height / 2 }) <= BLUE_BOX_PROXIMITY_THRESHOLD : true)
            );

            if (relevantBoxes.length > 0) {
                const firstDetectedBox = relevantBoxes[0]; // Get the first detected relevant box
                const coords = {
                    x: Math.round(firstDetectedBox.x + firstDetectedBox.width / 2),
                    y: Math.round(firstDetectedBox.y + firstDetectedBox.height / 2),
                };
                console.log(`DEBUG: Detected relevant blue box: ${JSON.stringify(omitImageFromLog(firstDetectedBox))}`);
                return { ...firstDetectedBox, coords }; 
            } else {
                updateStatus('No relevant blue boxes detected. Retrying in 2 seconds...', 'info');
                console.log('DEBUG: No relevant blue box found, retrying in 2 seconds.');
                retryCount++; 
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else {
            updateStatus('No blue boxes detected. Retrying in 2 seconds...', 'info');
            console.log('DEBUG: No blue box found, retrying in 2 seconds.');
            retryCount++; 
            await new Promise(resolve => setTimeout(resolve, 100)); 
        }
    }
    if (retryCount >= MAX_RETRIES) {
        updateStatus(`Failed to detect blue box after ${MAX_RETRIES} attempts. Exiting blue box detection.`, 'error');
        console.error(`ERROR: Failed to detect blue box after ${MAX_RETRIES} attempts. Exiting blue box detection.`);
    }
    return null; // Should only be reached if automation is stopped or max retries reached.
}

async function runBuildProtocol(dependencies) {
    const { updateStatus, getIsAutomationRunning, scrollToBottom, scrollSwipeDistance, updateCurrentFunction, originalRedBlobCoords } = dependencies;

    updateCurrentFunction('runBuildProtocol'); // Update current function display
    const startTime = Date.now();
        const clickAroundInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
        let lastClickAroundTime = startTime;
    let timerInterval = null; // To hold the interval ID for clearing

    try {
        // Set up an interval to update the timer in the UI
        timerInterval = setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const minutes = Math.floor(elapsedTime / 60000);
            const seconds = Math.floor((elapsedTime % 60000) / 1000);
            updateCurrentFunction(`runBuildProtocol (${minutes}m ${seconds}s)`);
        }, 1000); // Update every second

        // Step 1: Call check blue build box until one is found, every 2 seconds
        // This initial call needs to establish valid blueBoxCoords for the first hold.
        let initialDetectedBox = await findBlueBoxWithRetry(dependencies, originalRedBlobCoords);
        
        if (!initialDetectedBox) {
            updateStatus('Automation cannot start: No clickable build box found after retries. Exiting.', 'error');
            return 'error'; // Return 'error' if no initial box is found
        }

        if (initialDetectedBox.state === 'grey_max') {
            updateStatus('MAX build achieved at startup. Stopping automation.', 'success');
            console.log('DEBUG: MAX build achieved at startup. Stopping automation.');
            return 'max_build_at_startup';
        }

        // If we found any valid box (blue_build, grey_build, other_grey), set its coords as current
        blueBoxCoords = initialDetectedBox.coords;
        updateStatus(`Initial build box active at X:${blueBoxCoords.x}, Y:${blueBoxCoords.y} (State: ${initialDetectedBox.state})`, 'info');
        console.log(`DEBUG: Initial build box found: ${JSON.stringify(omitImageFromLog(initialDetectedBox))}`);

        // Step 2: Start a loop
        while (getIsAutomationRunning()) {
            const currentTime = Date.now();
            
            // Check if it's time to run clickAround (every 5 minutes)
            if (currentTime - lastClickAroundTime >= clickAroundInterval) {
                // Increment counter and determine exclude_red_blobs parameter
                const clickAroundCallNumber = dependencies.incrementClickAroundCallCounter();
                
                // Determine exclude_red_blobs parameter based on call number
                // Odd calls (1, 3, 5, etc.) = true (exclude red blobs)
                // Even calls (2, 4, 6, etc.) = false (don't exclude red blobs)
                const exclude_red_blobs = (clickAroundCallNumber % 2 === 1);
                
                updateStatus(`Finish Build routine: Running Click Around call #${clickAroundCallNumber} (exclude_red_blobs: ${exclude_red_blobs})`, 'warn');
                console.log(`DEBUG: Finish Build routine: Running Click Around call #${clickAroundCallNumber} (exclude_red_blobs: ${exclude_red_blobs})`);
                
                // Call clickAround instead of scrollToBottom
                const clickAroundDependencies = {
                    updateStatus: dependencies.updateStatus,
                    detectRedBlobs: dependencies.redBlobDetectorDetect,
                    performClick: dependencies.performClick,
                    performBatchedClicks: dependencies.performBatchedClicks || (async (clickArray) => {
                        // WARNING: FALLBACK BEING USED - This should not happen and indicates a dependency injection problem
                        console.warn('WARNING: Using performBatchedClicks FALLBACK - this will be much slower!');
                        console.warn('DEBUG: dependencies.performBatchedClicks was undefined, using individual clicks');
                        updateStatus('WARNING: Using slow fallback for batch clicks!', 'warn');
                        
                        if (!Array.isArray(clickArray)) return { success: false, error: 'Invalid click array' };
                        console.log(`DEBUG: Fallback processing ${clickArray.length} clicks individually (100ms each = ${clickArray.length * 100}ms total)`);
                        
                        for (const click of clickArray) {
                            await dependencies.performClick(click.x, click.y);
                        }
                        return { success: true };
                    }), // proper fallback wrapper
                    iphoneMirroringRegion: dependencies.iphoneMirroringRegion,
                    updateCurrentFunction: dependencies.updateCurrentFunction,
                    CLICK_AREAS: dependencies.CLICK_AREAS,
                    captureScreenRegion: dependencies.captureScreenRegion,
                    getIsClickAroundRunning: () => true, // Always return true for this timeout scenario
                    getIsClickAroundPaused: () => false, // Never paused for this timeout scenario
                };
                
                // Import and run clickAround
                const { clickAround } = require('./clickAround');
                await clickAround(clickAroundDependencies, exclude_red_blobs);
                
                // Update the last clickAround time for next interval
                lastClickAroundTime = currentTime;
                
                // Continue the loop instead of exiting (remove the old timeout behavior)
                continue;
            }
            // Perform blue box detection once per cycle to get the latest state
            const currentDetectedBox = await findBlueBoxWithRetry(dependencies, blueBoxCoords);

            if (!currentDetectedBox) {
                consecutiveNoBoxDetections++;
                updateStatus(`No active build box detected after retries (${consecutiveNoBoxDetections}/2). Continuing to click last known coordinates.`, 'warn');
                console.log(`DEBUG: No active build box found in current cycle after retries (${consecutiveNoBoxDetections}/2). Continuing to click last known coordinates.`);
                if (consecutiveNoBoxDetections >= 2) { // Changed: Threshold from 3 to 2
                    updateStatus('No active build box detected for 2 consecutive cycles. Exiting Finish Build.', 'error');
                    console.log('DEBUG: Exiting Finish Build due to consecutive failures to detect active build box.');
                    dependencies.setIsAutomationRunning(false); // Gracefully exit
                    return 'no_build_box_exceeded_retries'; // New exit status
                }
                // If no box is detected, continue to use the last known blueBoxCoords (which would be from initialDetectedBox or a previous cycle)
            } else if (currentDetectedBox.state === 'grey_max') {
                consecutiveNoBoxDetections = 0; // Reset counter if MAX build is achieved
                updateStatus('MAX build achieved. Stopping automation.', 'success');
                console.log('DEBUG: MAX build achieved. Stopping automation.');
                
                // Perform the "click off" action
                if (dependencies.performClick && dependencies.CLICK_AREAS.CLICK_OFF) {
                    updateStatus('Performing final "click off" action.', 'info');
                    await dependencies.performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                } else {
                    console.warn('WARNING: CLICK_OFF coordinates or performClick not available in dependencies.');
                }

                return 'max_build_achieved'; // Return status to indicate MAX build
            } else { // It's a blue_build, grey_build, or other_grey box
                consecutiveNoBoxDetections = 0; // Reset counter if a valid box (not grey_max) is detected
                // blueBoxCoords = currentDetectedBox.coords; // No longer update blueBoxCoords here, stick to initial
                updateStatus(`Build box active at X:${blueBoxCoords.x}, Y:${blueBoxCoords.y} (State: ${currentDetectedBox.state}). Continuing with established build coordinates.`, 'info');
                console.log(`DEBUG: Build box found in current cycle: ${JSON.stringify(omitImageFromLog(currentDetectedBox))}. Continuing with established build coordinates.`);
            }

            // Step 3: Call a function to hold down in the middle of the current blue box for 5 seconds
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
    } finally {
        // Clear the interval when the automation finishes or stops
        if (timerInterval) {
            clearInterval(timerInterval);
        }
    }
}

module.exports = { runBuildProtocol, resetAutomationState, findAndGetBlueBoxClickCoordinates };
