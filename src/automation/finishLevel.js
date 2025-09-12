function startAutomation(dependencies) {
    const { updateStatus, getIsAutomationRunning, detectBlueBoxes, redBlobDetectorDetect, performClick, captureScreenRegion, iphoneMirroringRegion, scrollUp, scrollToBottom, scrollSwipeDistance, scrollToBottomIterations, scrollUpAttempts, updateCurrentFunction, updatePreviousLevelDuration, getCurrentLevelStartTime, getRandomInt } = dependencies;

    updateCurrentFunction('startAutomation'); // Update current function display
    updateStatus('Finish Level Automation Started', 'info');
    console.log('Finish Level Automation Started');

    let redBlobsTried = new Set(); // To keep track of red blobs already tried in the current cycle
    let lastRedBlobCoords = null; // To store the coordinates of the last successfully clicked red blob

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

    let hasFinishedBuildOnce = false;
    const MAX_RED_BLOB_CLICK_ATTEMPTS = 3; // Define max retry attempts for red blob clicks
    const MAX_BLUE_BOX_CONFIRM_ATTEMPTS = 1; // New: Max retry attempts for confirming blue box
    const MAX_DETECTION_ATTEMPTS_PER_SCROLL_POSITION = 2; // New: Max detection attempts before a single scroll up
    // New flag to control finishBuildAutomation when called from finishLevel
    let isFinishBuildRunningInternal = false;

    // New helper function to confirm a blue build box, click it, and re-confirm its presence
    async function confirmAndClickBlueBuildBox(dependencies) {
        const { getIsAutomationRunning, detectBlueBoxes, performClick, captureScreenRegion, iphoneMirroringRegion, updateStatus } = dependencies;

        console.log('DEBUG: Attempting to confirm and click blue build box.');
        let confirmedBlueBuildBox = null;

        for (let i = 0; i < MAX_BLUE_BOX_CONFIRM_ATTEMPTS; i++) {
            if (!getIsAutomationRunning()) return null; // Exit if automation stopped

            updateStatus(`Confirming blue build box (Attempt ${i + 1}/${MAX_BLUE_BOX_CONFIRM_ATTEMPTS})...`, 'info');
            const fullScreenDataUrl = await captureScreenRegion();
            if (!getIsAutomationRunning()) return null;
            let blueBoxes = await detectBlueBoxes(fullScreenDataUrl, iphoneMirroringRegion);
            if (!getIsAutomationRunning()) return null;
            let blueBuildBox = blueBoxes.find(box => box.state === 'blue_build');

            if (blueBuildBox) {
                console.log(`DEBUG: Blue build box found on attempt ${i + 1}:`, omitImageFromLog(blueBuildBox));
                const blueBoxCenterX = Math.round(blueBuildBox.x + blueBuildBox.width / 2);
                const blueBoxCenterY = Math.round(blueBuildBox.y + blueBuildBox.height / 2);

                updateStatus(`Blue build box found. Clicking once at X:${blueBoxCenterX}, Y:${blueBoxCenterY}.`, 'info');
                console.log(`DEBUG: Clicking blue build box at X:${blueBoxCenterX}, Y:${blueBoxCenterY}.`);
                await performClick(blueBoxCenterX, blueBoxCenterY);
                if (!getIsAutomationRunning()) return null;
                await new Promise(resolve => setTimeout(resolve, 100)); // Small delay after click

                // Add 200ms delay before re-detection to ensure blue build has time to disappear if unstable
                await new Promise(resolve => setTimeout(resolve, 200));

                // Re-detect to confirm it's still there after clicking
                const fullScreenDataUrlAfterClick = await captureScreenRegion();
                if (!getIsAutomationRunning()) return null;
                let blueBoxesAfterClick = await detectBlueBoxes(fullScreenDataUrlAfterClick, iphoneMirroringRegion);
                if (!getIsAutomationRunning()) return null;
                let blueBuildBoxAfterClick = blueBoxesAfterClick.find(box => box.state === 'blue_build');

                if (blueBuildBoxAfterClick) {
                    console.log(`DEBUG: Blue build box confirmed after click on attempt ${i + 1}:`, omitImageFromLog(blueBuildBoxAfterClick));
                    confirmedBlueBuildBox = blueBuildBoxAfterClick;
                    break; // Confirmed, exit loop
                } else {
                    updateStatus('Blue build box disappeared after click. Retrying...', 'warn');
                    console.log('DEBUG: Blue build box disappeared after click. Retrying...');
                    await new Promise(resolve => setTimeout(resolve, 100)); // Longer delay before next retry
                }
            } else {
                updateStatus('No blue build box detected. Retrying...', 'warn');
                console.log('DEBUG: No blue build box detected. Retrying...');
                await new Promise(resolve => setTimeout(resolve, 100)); // Longer delay before next retry
            }
        }
        return confirmedBlueBuildBox;
    }

    async function prepBuild(redBlobCoords) {
        updateCurrentFunction('prepBuild'); // Update current function display
        updateStatus('Executing prepBuild function...', 'info');
        console.log('DEBUG: Executing prepBuild function...', 'info');
        if (!getIsAutomationRunning()) return 'stopped';

        // Add small delay before detection to ensure screen is stable
        await new Promise(resolve => setTimeout(resolve, 200));
        let blueBuildBoxConfirmed = await confirmAndClickBlueBuildBox(dependencies); // Try to confirm and click blue box first
        if (!getIsAutomationRunning()) return 'stopped';

        if (blueBuildBoxConfirmed) {
            updateStatus('Blue build box confirmed. Launching Finish Build automation.', 'info');
            console.log('DEBUG: Blue build box confirmed. Launching Finish Build.');
            // Set internal flag before launching finishBuildAutomation
            isFinishBuildRunningInternal = true;
            // Create custom dependencies for finishBuildAutomation
            const finishBuildDependencies = {
                ...dependencies,
                getIsAutomationRunning: () => getIsAutomationRunning() && isFinishBuildRunningInternal,
                setIsAutomationRunning: (state) => {
                    isFinishBuildRunningInternal = state;
                    // Also ensure that if finishBuild wants to stop, it doesn't stop finishLevel
                    if (!state) {
                        updateCurrentFunction('runFinishLevelProtocol'); // Revert to FinishLevel function display
                    }
                },
                originalRedBlobCoords: redBlobCoords, // Pass the red blob coordinates to finishBuild
            };
            // Launch finishBuild automation
            const buildResult = await dependencies.finishBuildAutomationRunBuildProtocol(finishBuildDependencies); // Pass custom dependencies
            // Reset internal flag after finishBuildAutomation returns
            isFinishBuildRunningInternal = false;
            if (!getIsAutomationRunning()) return 'stopped';

            // Modified: Check if finishBuild exits for the first time after completing a full build cycle.
            // Exclude 'stopped', 'error', and 'max_build_at_startup' (which means MAX was detected immediately, no build cycle completed).
            if (buildResult !== 'stopped' && buildResult !== 'error' && buildResult !== 'max_build_at_startup' && !hasFinishedBuildOnce) {
                console.log(`DEBUG: First exit from Finish Build (status: ${buildResult}) detected. Scrolling to bottom.`);
                const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                if (!getIsAutomationRunning()) return 'stopped'; // Changed from break to return 'stopped'
                hasFinishedBuildOnce = true;
            }

            if (buildResult === 'max_build_achieved' || buildResult === 'max_build_at_startup') {
                updateStatus('Finish Build reported MAX build. Exiting prepBuild.', 'success');
                console.log('DEBUG: Finish Build reported MAX build. Exiting prepBuild.');
                return buildResult; // Exit prepBuild but let Finish Level loop continue
            } else if (buildResult === 'no_blue_box_found') { // This status isn't returned by finishBuild currently, but was discussed.
                updateStatus('Finish Build failed to find blue box. Exiting prepBuild to allow red blob detection.', 'warn');
                console.log('DEBUG: Finish Build reported no blue box found. Exiting prepBuild.');
                return 'finish_build_failed_no_blue_box'; // New return status
            } else if (buildResult === 'timeout') { // New: Handle timeout from finishBuildAutomationRunBuildProtocol
                updateStatus('Finish Build timed out. Exiting prepBuild.', 'warn');
                console.log('DEBUG: Finish Build timed out. Exiting prepBuild.');
                return 'finish_build_timed_out'; // New return status for timeout
            }
            if (!getIsAutomationRunning()) return 'stopped';
            updateStatus('Finish Build automation completed. Exiting prepBuild.', 'success');
            console.log('DEBUG: Finish Build automation completed. Exiting prepBuild.');
            return 'finish_build_launched'; // Indicate Finish Build was launched successfully
        }

        updateStatus('No blue build box confirmed initially. Initiating red blob click retries.', 'warn');
        console.log('DEBUG: No blue build box confirmed initially. Initiating red blob click retries.');

        // The retry logic is now unified here for both initial missing blue box and blue box disappearing after first click
        // Ensure we have redBlobCoords to click on for retries
        if (!redBlobCoords) {
            updateStatus('Error: Missing original red blob coordinates for retry. Exiting prepBuild.', 'error');
            console.error('ERROR: prepBuild called without valid redBlobCoords for retry.');
            return 'no_blue_build';
        }

        const clickX = redBlobCoords.x + Math.floor(redBlobCoords.width * 1.5);
        const clickY = redBlobCoords.y + Math.floor(redBlobCoords.height * 1.5);

        let blueBuildBoxAfterClicks = null;

        for (let i = 0; i < MAX_RED_BLOB_CLICK_ATTEMPTS; i++) {
            if (!getIsAutomationRunning()) return 'stopped';

            // Log before click attempt
            console.log(`DEBUG: Initiating red blob click attempt ${i+1}/${MAX_RED_BLOB_CLICK_ATTEMPTS}.`);

            if (i === 0) { // First retry attempt (double-click)
                console.log(`DEBUG: Double clicking red blob (attempt ${i+1}) at X:${Math.round(clickX)}, Y:${Math.round(clickY)}.`);
                await performClick(Math.round(clickX), Math.round(clickY)); // First click of double click
                if (!getIsAutomationRunning()) return 'stopped';
                console.log('DEBUG: First click of double click performed. Waiting 200ms.');
                await new Promise(resolve => setTimeout(resolve, 200));
                if (!getIsAutomationRunning()) return 'stopped';
                await performClick(Math.round(clickX), Math.round(clickY)); // Second click of double click
                if (!getIsAutomationRunning()) return 'stopped';
                console.log('DEBUG: Second click of double click performed. Waiting 500ms.');
                await new Promise(resolve => setTimeout(resolve, 300)); // Increased delay after double click for blue build stabilization
            } else { // Subsequent retry attempts (single click)
                console.log(`DEBUG: Single clicking red blob (attempt ${i+1}) at X:${Math.round(clickX)}, Y:${Math.round(clickY)}.`);
                await performClick(Math.round(clickX), Math.round(clickY));
                if (!getIsAutomationRunning()) return 'stopped';
                console.log('DEBUG: Single click performed. Waiting 500ms.');
                await new Promise(resolve => setTimeout(resolve, 300)); // Increased delay after click for blue build stabilization
            }
            // Log after click attempt
            console.log(`DEBUG: Red blob click attempt ${i+1} completed. Checking for blue box.`);

            // After clicking the red blob, try to confirm and click the blue build box
            let currentConfirmedBlueBox = await confirmAndClickBlueBuildBox(dependencies);
            if (!getIsAutomationRunning()) return 'stopped';

            if (currentConfirmedBlueBox) {
                blueBuildBoxAfterClicks = currentConfirmedBlueBox;
                break; // Blue box confirmed, exit red blob retry loop
            }
        }

        if (blueBuildBoxAfterClicks) {
            updateStatus('Blue build found after clicking red blob. Launching Finish Build automation.', 'info');
            console.log('DEBUG: Blue build found after clicking red blob. Launching Finish Build.');
            // Set internal flag before launching finishBuildAutomation
            isFinishBuildRunningInternal = true;
            // Create custom dependencies for finishBuildAutomation
            const finishBuildDependencies = {
                ...dependencies,
                getIsAutomationRunning: () => getIsAutomationRunning() && isFinishBuildRunningInternal,
                setIsAutomationRunning: (state) => {
                    isFinishBuildRunningInternal = state;
                    // Also ensure that if finishBuild wants to stop, it doesn't stop finishLevel
                    if (!state) {
                        updateCurrentFunction('runFinishLevelProtocol'); // Revert to FinishLevel function display
                    }
                },
                originalRedBlobCoords: redBlobCoords, // Pass the red blob coordinates to finishBuild
            };
            const buildResult = await dependencies.finishBuildAutomationRunBuildProtocol(finishBuildDependencies); // Corrected dependency call
            // Reset internal flag after finishBuildAutomation returns
            isFinishBuildRunningInternal = false;
            if (!getIsAutomationRunning()) return 'stopped';

            // Modified: Check if finishBuild exits for the first time, regardless of its specific success status.
            // Exclude 'stopped' or 'error' from prepBuild itself.
            if (buildResult !== 'stopped' && buildResult !== 'error' && !hasFinishedBuildOnce) {
                console.log(`DEBUG: First exit from Finish Build (status: ${buildResult}) detected after red blob click. Scrolling to bottom.`);
                const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                if (!getIsAutomationRunning()) return 'stopped'; // Changed from break to return 'stopped'
                hasFinishedBuildOnce = true;
            }

            if (buildResult === 'max_build_achieved' || buildResult === 'max_build_at_startup') {
                updateStatus('Finish Build reported MAX build. Exiting prepBuild.', 'success');
                console.log('DEBUG: Finish Build reported MAX build. Exiting prepBuild.');
                return buildResult; // Exit prepBuild but let Finish Level loop continue
            }
            if (!getIsAutomationRunning()) return 'stopped';
            updateStatus('Finish Build automation completed. Exiting prepBuild.', 'success');
            console.log('DEBUG: Finish Build automation completed. Exiting prepBuild.');
            return 'finish_build_launched';
        } else {
            updateStatus('No blue build found even after multiple clicks on red blob. Exiting prepBuild.', 'error');
            console.log('DEBUG: No blue build found after multiple clicks. Exiting prepBuild.');
            return 'no_blue_build';
        }
    }

    async function exitAndStartNewLevel(dependencies) {
        const { performClick, updateStatus, CLICK_AREAS, getIsAutomationRunning, updateCurrentFunction, updatePreviousLevelDuration, getCurrentLevelStartTime, resetClickAroundCallCounter, captureLevelName, updateCurrentLevelName, captureScreenRegion } = dependencies;

        // Reset clickAround counter for new level
        resetClickAroundCallCounter();
        
        updateCurrentFunction('exitAndStartNewLevel'); // Update current function display
        updateStatus('Starting "Exit and Start New Level" routine.', 'info');
        console.log('DEBUG: Starting "Exit and Start New Level" routine. Performing initial click at "Start Exiting".');
        await performClick(CLICK_AREAS.START_EXITING.x, CLICK_AREAS.START_EXITING.y);
        updateStatus('Clicked "Start Exiting".', 'info');
        console.log(`DEBUG: Finished click at "Start Exiting" at (${CLICK_AREAS.START_EXITING.x}, ${CLICK_AREAS.START_EXITING.y}). Waiting 500ms.`);

        // Wait 500ms
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!getIsAutomationRunning()) { return; }

        // Click at "confirm exit"
        console.log('DEBUG: Continuing "Exit and Start New Level" routine. Performing click at "Confirm Exit".');
        await performClick(CLICK_AREAS.CONFIRM_EXIT.x, CLICK_AREAS.CONFIRM_EXIT.y);
        updateStatus('Clicked "Confirm Exit".', 'info');
        console.log(`DEBUG: Finished click at "Confirm Exit" at (${CLICK_AREAS.CONFIRM_EXIT.x}, ${CLICK_AREAS.CONFIRM_EXIT.y}). Waiting 10,000ms.`);

        // Wait 10,000ms
        await new Promise(resolve => setTimeout(resolve, 10000));
        if (!getIsAutomationRunning()) { return; }

        // Capture level name using OCR before clicking "Start Level"
        console.log('DEBUG: Capturing level name using OCR...');
        updateStatus('Capturing level name...', 'info');
        try {
            const levelName = await dependencies.captureLevelName(dependencies.captureScreenRegion);
            if (levelName && levelName !== 'Unknown Level') {
                console.log(`DEBUG: Level name captured successfully: "${levelName}"`);
                dependencies.updateCurrentLevelName(levelName);
                updateStatus(`Level name captured: "${levelName}"`, 'success');
            } else {
                console.log('DEBUG: Level name capture failed or returned empty result');
                dependencies.updateCurrentLevelName('Unknown Level');
                updateStatus('Level name capture failed', 'warn');
            }
        } catch (error) {
            console.error('ERROR: Level name OCR failed:', error);
            dependencies.updateCurrentLevelName('Unknown Level');
            updateStatus('Level name OCR error', 'error');
        }

        // Click at "start level"
        console.log('DEBUG: Continuing "Exit and Start New Level" routine. Performing click at "Start Level".');
        await performClick(CLICK_AREAS.START_LEVEL.x, CLICK_AREAS.START_LEVEL.y);
        updateStatus('Clicked "Start Level".', 'info');
        console.log(`DEBUG: Finished click at "Start Level" at (${CLICK_AREAS.START_LEVEL.x}, ${CLICK_AREAS.START_LEVEL.y}). Routine complete.`);
        // Add an extra click at the same location as the last click, separated by 100ms
        console.log('DEBUG: Performing extra click at "Start Level" after 100ms.');
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!getIsAutomationRunning()) { return; }
        await performClick(230, 676);
        updateStatus('Performed extra click at "Start Level".', 'info');
        console.log(`DEBUG: Extra click performed at "Start Level" at (230, 676). Routine complete.`);

        // New: Add another hardcoded click
        console.log('DEBUG: Performing additional hardcoded click after 100ms.');
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!getIsAutomationRunning()) { return; }
        await performClick(230, 636);
        updateStatus('Performed additional hardcoded click.', 'info');
        console.log(`DEBUG: Additional hardcoded click performed at (230, 636).`)

        updateStatus('"Exit and Start New Level" routine completed.', 'success');
        console.log('DEBUG: "Exit and Start New Level" routine completed.');
        // After successfully exiting and starting a new level, scroll down to the bottom
        console.log('DEBUG: Exit and Start New Level routine complete. Scrolling to bottom.');
        // Using central coordinates of the iPhone mirroring region and a default scroll distance
        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
        await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
        if (!getIsAutomationRunning()) { return; }

        // After a successful exit and new level start, update the previous level duration
        updatePreviousLevelDuration(Date.now() - getCurrentLevelStartTime()); // Use the getter function
        
        // Reset the flag so scroll-to-bottom will trigger after the first successful build on this new level
        hasFinishedBuildOnce = false;
        redBlobRetryCount.clear(); // Reset retry counters for new level
        console.log('DEBUG: Reset hasFinishedBuildOnce to false for new level.');
    }

    let scrollUpCount = 0; // Counter for consecutive scroll-up attempts
    let detectionAttemptCount = 0; // Counter for detection attempts within current scroll position
    let redBlobRetryCount = new Map(); // Track retry attempts per red blob location (key: "x,y", value: count)
    const MAX_RED_BLOB_RETRIES = 3; // Maximum retries for the same red blob location before triggering scroll-to-bottom

    async function runFinishLevelProtocol() {
        updateCurrentFunction('runFinishLevelProtocol'); // Update current function display
        while (getIsAutomationRunning()) {
            updateStatus('Checking for blue build box...', 'info');
            const fullScreenDataUrl = await captureScreenRegion();
            const blueBoxes = await detectBlueBoxes(fullScreenDataUrl, iphoneMirroringRegion);
            const blueBuildBox = blueBoxes.find(box => box.state === 'blue_build' || box.state === 'grey_build'); // Exclude 'unknown' from initial decision

            if (blueBuildBox) {
                detectionAttemptCount = 0; // Reset on success
                scrollUpCount = 0; // Reset on success
                updateStatus('Blue build box found. Launching prepBuild.', 'info');
                console.log('DEBUG: Blue build box found. Launching prepBuild.');
                redBlobsTried.clear(); // Reset tried blobs if a blue box is found and build is about to start
                redBlobRetryCount.clear(); // Reset retry counters when starting a build
                const result = await prepBuild(lastRedBlobCoords);
                if (!getIsAutomationRunning()) break; // Exit loop if automation stopped during prepBuild
                updateCurrentFunction('runFinishLevelProtocol'); // Update current function display after prepBuild returns

                // After prepBuild, check for "exit level" red blob
                updateStatus('Checking for "exit level" red blob after prepBuild (blue box found).', 'info');
                console.log('DEBUG: Checking for "exit level" red blob (blue box found).');
                const fullScreenDataUrlAfterBuild = await captureScreenRegion();
                const redBlobsAfterBuild = await redBlobDetectorDetect(fullScreenDataUrlAfterBuild, iphoneMirroringRegion);
                console.log(`DEBUG: Red blobs detected after prepBuild for exit level check (blue box found): ${JSON.stringify(omitImageFromLog(redBlobsAfterBuild))}`);
                const exitLevelBlobFound = redBlobsAfterBuild.some(blob => blob.name === 'exit level');

                if (exitLevelBlobFound) {
                    updateStatus('"Exit level" red blob detected. Initiating exit and restart.', 'info');
                    console.log('DEBUG: "Exit level" red blob detected. Calling exitAndStartNewLevel.');
                    await exitAndStartNewLevel(dependencies); // Pass dependencies here
                    if (!getIsAutomationRunning()) { // Check if automation was stopped during exitAndStartNewLevel
                        updateStatus('Finish Level automation stopped during exit and new level start.', 'warn');
                        break;
                    }
                    updateCurrentFunction('runFinishLevelProtocol'); // Update current function display after exitAndStartNewLevel returns
                    // After exiting and starting a new level, the loop continues to re-detect from scratch
                    continue;
                }

                if (result === 'max_build_achieved') {
                    updateStatus('Finish Build reported MAX build. Finish Level continuing loop.', 'success');
                    console.log('DEBUG: Finish Build reported MAX build. Finish Level continuing loop.');
                    // Do not break; continue the loop
                } else if (result === 'finish_build_launched') {
                    updateStatus('Finish Build automation successfully launched from prepBuild.', 'info');
                    console.log('DEBUG: Finish Build automation successfully launched.');
                } else if (result === 'no_blue_build') {
                    // This case should ideally not happen if blueBuildBox was found, but for robustness
                    updateStatus('PrepBuild returned no_blue_build even though blue box was initially found. Continuing.', 'warn');
                    console.log('DEBUG: PrepBuild returned no_blue_build unexpectedly. Continuing.');
                } else if (result === 'error') {
                    updateStatus('PrepBuild encountered an error. Stopping Finish Level.', 'error');
                    console.error('ERROR: PrepBuild returned an error state. Stopping Finish Level.');
                    break; // Stop the loop on error
                } else if (result === 'stopped') {
                    updateStatus('Finish Level automation stopped during prepBuild.', 'info');
                    console.log('DEBUG: Finish Level automation stopped during prepBuild.');
                    break; // Exit the loop if automation was stopped
                } else if (result === 'no_build_box_exceeded_retries') { // New: Handle finish build exiting due to no build box
                    updateStatus('Finish Build exited due to consecutive failures. Continuing Finish Level.', 'warn');
                    console.log('DEBUG: Finish Build exited due to consecutive failures. Continuing Finish Level.');
                    redBlobsTried.add(JSON.stringify(targetBlob)); // Mark current red blob as tried
                    lastRedBlobCoords = null; // Clear last red blob coords to avoid immediately retrying it
                } else if (result === 'timeout') { // New: Handle finish build timeout
                    updateStatus('Finish Build timed out. Continuing Finish Level.', 'warn');
                    console.log('DEBUG: Finish Build timed out. Continuing Finish Level.');
                    redBlobsTried.add(JSON.stringify(targetBlob)); // Mark current red blob as tried
                    lastRedBlobCoords = null; // Clear last red blob coords
                }
            } else {
                updateStatus('No blue build box found. Detecting red blobs...', 'info');
                console.log('DEBUG: No blue build box found. Detecting red blobs.');
                const redBlobs = await redBlobDetectorDetect(fullScreenDataUrl, iphoneMirroringRegion);
                if (!getIsAutomationRunning()) break; // Exit loop if automation stopped during redBlobDetectorDetect

                // Check for the 'exit level' blob immediately after detection
                const exitLevelBlobFound = redBlobs.some(blob => blob.name === 'exit level');

                if (exitLevelBlobFound) {
                    updateStatus('"Exit level" red blob detected. Initiating exit and restart.', 'info');
                    console.log('DEBUG: "Exit level" red blob detected. Calling exitAndStartNewLevel.');
                    await exitAndStartNewLevel(dependencies);
                    if (!getIsAutomationRunning()) {
                        updateStatus('Finish Level automation stopped during exit and new level start.', 'warn');
                        break;
                    }
                    updateCurrentFunction('runFinishLevelProtocol'); // Update current function display after exitAndStartNewLevel returns
                    continue; // After exiting and starting a new level, the loop continues to re-detect
                }

                // If no red blobs are found at all (after checking for exit level blob)
                if (redBlobs.length === 0) {
                    updateStatus('No red blobs found (excluding named exit level blob if present). Trying again in 1 second...', 'warn');
                    console.log('DEBUG: No red blobs found (excluding named exit level blob if present). Trying again in 1 second...');
                    redBlobsTried.clear(); // Clear tried blobs if no red blobs are found at all
                    lastRedBlobCoords = null; // Clear if no red blobs are found at all
                    detectionAttemptCount++; // Increment attempt count

                    if (detectionAttemptCount >= MAX_DETECTION_ATTEMPTS_PER_SCROLL_POSITION) { // Use new constant here
                        // Before scrolling up, try one more red blob detection in case blobs were wiggling
                        console.log(`DEBUG: Performing second red blob detection before scrolling up (no blobs found case - blobs might be wiggling).`);
                        updateStatus('Performing second red blob detection before scrolling up...', 'info');
                        const fullScreenDataUrlSecond = await captureScreenRegion();
                        if (!getIsAutomationRunning()) break;
                        
                        const redBlobsSecond = await redBlobDetectorDetect(fullScreenDataUrlSecond, iphoneMirroringRegion);
                        if (!getIsAutomationRunning()) break;
                        
                        // Check if we found any actionable blobs on second attempt
                        const untriedRedBlobsSecond = redBlobsSecond.filter(blob => !blob.name);
                        
                        if (untriedRedBlobsSecond.length > 0) {
                            console.log(`DEBUG: Second detection found ${untriedRedBlobsSecond.length} actionable red blobs. Continuing with detection loop.`);
                            updateStatus(`Second detection found ${untriedRedBlobsSecond.length} red blobs. Continuing...`, 'success');
                            detectionAttemptCount = 0; // Reset attempt count since we found new blobs
                            redBlobsTried.clear(); // Clear tried blobs since we found new ones
                            continue; // Go back to main loop with new blobs
                        }
                        
                        console.log(`DEBUG: Second detection also found no actionable blobs. Proceeding to scroll up.`);
                        console.log(`DEBUG: No red blobs or blue boxes found after ${detectionAttemptCount} attempts (including second detection). Scrolling up.`);
                        updateStatus(`No objects found after ${detectionAttemptCount} attempts (including second detection). Scrolling up...`, 'warn');
                        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                        await scrollUp(scrollX, scrollY, { updateCurrentFunction, CLICK_AREAS: dependencies.CLICK_AREAS, performClick, getRandomInt }); // Use configurable scroll swipe distance
                        scrollUpCount++;
                        console.log(`DEBUG: Scroll up count incremented to ${scrollUpCount}, limit is ${scrollUpAttempts}.`);
                        detectionAttemptCount = 0; // Reset attempt count after scrolling

                        if (scrollUpCount >= scrollUpAttempts) { // Use configurable scrollUpAttempts
                            console.log(`DEBUG: Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search.`);
                            updateStatus(`Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search...`, 'warn');
                            await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS }); // Use configurable values
                            scrollUpCount = 0; // Reset scroll up count
                        }
                    }
                    continue; // Continue the loop to re-detect from scratch
                }

                if (redBlobs.length > 0) {
                    // Don't reset detectionAttemptCount or scrollUpCount here - only reset when actionable blobs are found
                    let untriedRedBlobs = redBlobs.filter(blob => !redBlobsTried.has(JSON.stringify(blob)) && !blob.name);

                    let targetBlob = null;

                    // Prioritize the last red blob if it's still present and not a named blob
                    if (lastRedBlobCoords) {
                        const foundLastBlob = untriedRedBlobs.find(blob =>
                            Math.abs(blob.x - lastRedBlobCoords.x) < 5 &&
                            Math.abs(blob.y - lastRedBlobCoords.y) < 5 &&
                            !blob.name // Ensure it's not a named blob
                        );
                        if (foundLastBlob) {
                            targetBlob = foundLastBlob;
                            updateStatus('Prioritizing last clicked red blob.', 'info');
                            console.log('DEBUG: Prioritizing last clicked red blob:', JSON.stringify(omitImageFromLog(targetBlob)));
                        } else {
                            lastRedBlobCoords = null; // Clear if not found
                            console.log('DEBUG: Last clicked red blob not found or is a named blob. Clearing lastRedBlobCoords.');
                        }
                    }

                    if (!targetBlob) {
                        if (untriedRedBlobs.length === 0) {
                            console.log('DEBUG: All red blobs tried or all remaining are named. Resetting and re-attempting with all unnamed blobs.', 'info');
                            redBlobsTried.clear();
                            untriedRedBlobs = redBlobs.filter(blob => !blob.name); // Reset with only unnamed blobs
                            
                            // If still no untried blobs after reset (all are named), increment attempt count
                            if (untriedRedBlobs.length === 0) {
                                console.log(`DEBUG: No untried red blobs after reset (all are named). Incrementing detection attempt count from ${detectionAttemptCount} to ${detectionAttemptCount + 1}.`);
                                detectionAttemptCount++;
                                console.log(`DEBUG: Detection attempt count is now ${detectionAttemptCount}, threshold is ${MAX_DETECTION_ATTEMPTS_PER_SCROLL_POSITION}.`);
                                
                                // Check if we should scroll up
                                if (detectionAttemptCount >= MAX_DETECTION_ATTEMPTS_PER_SCROLL_POSITION) {
                                    // Before scrolling up, try one more red blob detection in case blobs were wiggling
                                    console.log(`DEBUG: Performing second red blob detection before scrolling up (all blobs tried case - blobs might be wiggling).`);
                                    updateStatus('Performing second red blob detection before scrolling up...', 'info');
                                    const fullScreenDataUrlSecond = await captureScreenRegion();
                                    if (!getIsAutomationRunning()) break;
                                    
                                    const redBlobsSecond = await redBlobDetectorDetect(fullScreenDataUrlSecond, iphoneMirroringRegion);
                                    if (!getIsAutomationRunning()) break;
                                    
                                    // Check if we found any new actionable blobs on second attempt (not previously tried)
                                    const untriedRedBlobsSecond = redBlobsSecond.filter(blob => !blob.name && !redBlobsTried.has(`${blob.x},${blob.y}`));
                                    
                                    if (untriedRedBlobsSecond.length > 0) {
                                        console.log(`DEBUG: Second detection found ${untriedRedBlobsSecond.length} new actionable red blobs. Continuing with detection loop.`);
                                        updateStatus(`Second detection found ${untriedRedBlobsSecond.length} new red blobs. Continuing...`, 'success');
                                        detectionAttemptCount = 0; // Reset attempt count since we found new blobs
                                        continue; // Go back to main loop with new blobs
                                    }
                                    
                                    console.log(`DEBUG: Second detection also found no new actionable blobs. Proceeding to scroll up.`);
                                    console.log(`DEBUG: No usable red blobs found after ${detectionAttemptCount} attempts (including second detection). Scrolling up.`);
                                    updateStatus(`No usable objects found after ${detectionAttemptCount} attempts (including second detection). Scrolling up...`, 'warn');
                                    const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                                    const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                                    await scrollUp(scrollX, scrollY, { updateCurrentFunction, CLICK_AREAS: dependencies.CLICK_AREAS, performClick, getRandomInt });
                                    scrollUpCount++;
                                    console.log(`DEBUG: Scroll up count incremented to ${scrollUpCount}, limit is ${scrollUpAttempts}.`);
                                    detectionAttemptCount = 0; // Reset attempt count after scrolling

                                    if (scrollUpCount >= scrollUpAttempts) {
                                        console.log(`DEBUG: Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search.`);
                                        updateStatus(`Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search...`, 'warn');
                                        await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                                        scrollUpCount = 0; // Reset scroll up count
                                    }
                                    continue; // Skip the rest of this iteration and start fresh
                                } else {
                                    console.log(`DEBUG: Detection attempt count ${detectionAttemptCount} has not reached threshold ${MAX_DETECTION_ATTEMPTS_PER_SCROLL_POSITION}. Continuing loop.`);
                                    // If we haven't reached the scroll threshold, continue to next iteration
                                    continue;
                                }
                            }
                        }

                        if (untriedRedBlobs.length > 0) {
                            // Reset detection attempt count and scroll up count when we find actionable red blobs
                            detectionAttemptCount = 0;
                            scrollUpCount = 0;
                            // Find the highest Y-coordinate among untried blobs
                            const highestY = untriedRedBlobs.reduce((maxY, blob) => Math.max(maxY, blob.y), -Infinity);

                            // Filter for blobs within 5 pixels of the highest Y-coordinate
                            const topRedBlobs = untriedRedBlobs.filter(blob => Math.abs(blob.y - highestY) <= 5);

                            // From these, select the one with the highest X-coordinate
                            targetBlob = topRedBlobs.reduce((prev, current) =>
                                (prev.x > current.x) ? prev : current
                            );
                            updateStatus('No last clicked red blob or not found, selecting highest Y-axis (and then highest X-axis) untried red blob.', 'info');
                            console.log('DEBUG: No last clicked red blob or not found, selecting highest Y-axis (and then highest X-axis) untried red blob:', JSON.stringify(omitImageFromLog(targetBlob)));
                        }
                    }

                    if (targetBlob) {
                        const clickX = targetBlob.x + targetBlob.width / 2 + 25;
                        const clickY = targetBlob.y + targetBlob.height / 2 + 25;
                        updateStatus(`Clicking near red blob at X:${Math.round(clickX)}, Y:${Math.round(clickY)}`, 'info');
                        console.log(`DEBUG: Clicking near red blob at X:${Math.round(clickX)}, Y:${Math.round(clickY)}`);
                        await performClick(Math.round(clickX), Math.round(clickY));
                        if (!getIsAutomationRunning()) break; // Exit loop if automation stopped during performClick
                        const prepBuildResult = await prepBuild(targetBlob ? { x: targetBlob.x, y: targetBlob.y, width: targetBlob.width, height: targetBlob.height } : null);
                        if (!getIsAutomationRunning()) break; // Exit loop if automation stopped during prepBuild

                        if (!getIsAutomationRunning()) {
                            updateStatus('Finish Level automation stopped during prepBuild processing.', 'warn');
                            break;
                        }

                        // After prepBuild, check for "exit level" red blob
                        updateStatus('Checking for "exit level" red blob after prepBuild (red blob clicked).', 'info');
                        console.log('DEBUG: Checking for "exit level" red blob (red blob clicked).');
                        const fullScreenDataUrlAfterBuild = await captureScreenRegion();
                        const redBlobsAfterBuild = await redBlobDetectorDetect(fullScreenDataUrlAfterBuild, iphoneMirroringRegion);
                        console.log(`DEBUG: Red blobs detected after prepBuild for exit level check (red blob clicked): ${JSON.stringify(omitImageFromLog(redBlobsAfterBuild))}`);
                        const exitLevelBlobFound = redBlobsAfterBuild.some(blob => blob.name === 'exit level');

                        if (exitLevelBlobFound) {
                            updateStatus('"Exit level" red blob detected. Initiating exit and restart.', 'info');
                            console.log('DEBUG: "Exit level" red blob detected. Calling exitAndStartNewLevel.');
                            await exitAndStartNewLevel(dependencies); // Pass dependencies here
                            if (!getIsAutomationRunning()) { // Check if automation was stopped during exitAndStartNewLevel
                                updateStatus('Finish Level automation stopped during exit and new level start.', 'warn');
                                break;
                            }
                            updateCurrentFunction('runFinishLevelProtocol'); // Update current function display after exitAndStartNewLevel returns
                            // After exiting and starting a new level, the loop continues to re-detect from scratch
                            continue;
                        }

                        if (prepBuildResult === 'max_build_achieved') {
                            updateStatus('Finish Build reported MAX build. Continuing Finish Level loop.', 'info');
                            console.log('DEBUG: prepBuild reported MAX build, continuing Finish Level loop.');
                            // Continue the loop, allowing Finish Level to re-evaluate for blue/red blobs
                            continue;
                        } else if (prepBuildResult === 'error' || prepBuildResult === 'stopped') {
                            updateStatus('PrepBuild encountered an error or was stopped. Stopping Finish Level.', 'error');
                            console.error('ERROR: PrepBuild returned an error or stopped state. Stopping Finish Level.');
                            break; // Stop the loop on error
                        } else if (prepBuildResult === 'finish_build_launched') {
                            redBlobsTried.clear(); // Reset tried blobs if finishBuild was launched successfully
                            redBlobRetryCount.clear(); // Reset retry counters on successful finishBuild launch
                            lastRedBlobCoords = targetBlob; // Store the last successfully clicked red blob
                            updateStatus('Finish Build automation successfully launched from prepBuild after red blob click.', 'info');
                            console.log('DEBUG: Finish Build automation successfully launched after red blob click.');

                            // Modified: Check if finishBuild exits for the first time, regardless of its specific success status.
                            // Exclude 'stopped' or 'error' from prepBuild itself.
                            if (prepBuildResult !== 'stopped' && prepBuildResult !== 'error' && !hasFinishedBuildOnce) {
                                console.log(`DEBUG: First exit from Finish Build (status: ${prepBuildResult}) detected after red blob click. Scrolling to bottom.`);
                                const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                                const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                                await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                                if (!getIsAutomationRunning()) return 'stopped'; // Changed from break to return 'stopped'
                                hasFinishedBuildOnce = true;
                            }
                        } else if (prepBuildResult === 'no_blue_build' || prepBuildResult === 'no_red_blobs_found' || prepBuildResult === 'finish_build_failed_no_blue_box') {
                            // Track retry attempts for this red blob location (approximate matching within 10 pixels)
                            const blobLocationKey = `${Math.round(targetBlob.x / 10) * 10},${Math.round(targetBlob.y / 10) * 10}`;
                            const currentRetries = redBlobRetryCount.get(blobLocationKey) || 0;
                            const newRetryCount = currentRetries + 1;
                            redBlobRetryCount.set(blobLocationKey, newRetryCount);
                            
                            console.log(`DEBUG: Red blob at approximate location ${blobLocationKey} failed prepBuild. Retry count: ${newRetryCount}/${MAX_RED_BLOB_RETRIES}`);
                            
                            // Check if we've exceeded the retry limit for this location
                            if (newRetryCount >= MAX_RED_BLOB_RETRIES) {
                                console.log(`DEBUG: Red blob location ${blobLocationKey} has failed ${newRetryCount} times. Triggering scroll-to-bottom reset.`);
                                updateStatus(`Red blob failed ${newRetryCount} times. Scrolling to bottom to reset...`, 'warn');
                                
                                // Clear retry counters and perform scroll-to-bottom reset
                                redBlobRetryCount.clear();
                                redBlobsTried.clear();
                                lastRedBlobCoords = null;
                                
                                const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                                const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                                await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                                
                                // Reset counters
                                scrollUpCount = 0;
                                detectionAttemptCount = 0;
                                
                                console.log('DEBUG: Scroll-to-bottom reset completed due to red blob retry limit exceeded.');
                                continue; // Continue to restart detection from the top
                            }
                            
                            redBlobsTried.add(JSON.stringify(targetBlob));
                            lastRedBlobCoords = null; // Clear if not successful
                            updateStatus(`No blue build found after red blob click (attempt ${newRetryCount}/${MAX_RED_BLOB_RETRIES}). Trying another red blob.`, 'warn');
                            console.log('DEBUG: No blue build or red blobs found after red blob click. Marking as tried.');
                        }
                    } else {
                        updateStatus('No untried red blobs found after reset. Continuing...', 'warn');
                        console.log('DEBUG: No untried red blobs after reset.');
                        detectionAttemptCount++; // Increment attempt count when no usable blobs are found
                    }

                } else {
                    updateStatus('No red blobs found. Trying again in 1 second...', 'warn');
                    console.log('DEBUG: No red blobs found. Trying again in 1 second...');
                    redBlobsTried.clear(); // Clear tried blobs if no red blobs are found at all
                    lastRedBlobCoords = null; // Clear if no red blobs are found
                    detectionAttemptCount++; // Increment attempt count
                    // Removed: await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before re-attempting

                    if (detectionAttemptCount >= 2) { // Changed from 3 to 2
                        console.log(`DEBUG: No red blobs found after ${detectionAttemptCount} attempts. Scrolling up.`);
                        updateStatus(`No objects found after ${detectionAttemptCount} attempts. Scrolling up...`, 'warn');
                        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                        await scrollUp(scrollX, scrollY, { updateCurrentFunction, CLICK_AREAS: dependencies.CLICK_AREAS, performClick, getRandomInt }); // Scroll up by 200 pixels
                        scrollUpCount++;
                        detectionAttemptCount = 0; // Reset attempt count after scrolling

                        if (scrollUpCount >= 2) { // Changed from 20 to 2
                            console.log(`DEBUG: Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search.`);
                            updateStatus(`Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search...`, 'warn');
                            await scrollToBottom(scrollX, scrollY, 100, 20, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS }); // Scroll to bottom, then the loop restarts from top
                            scrollUpCount = 0; // Reset scroll up count
                        }
                    }
                    // Do not `continue` here, let the main loop handle the 2-second delay for consistency.
                }
            }
            if (!getIsAutomationRunning()) break; // Check if automation stopped before next delay
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay before next loop iteration
            if (!getIsAutomationRunning()) break; // Check if automation stopped after delay
        }
        updateStatus('Finish Level Automation loop stopped.', 'info');
        console.log('DEBUG: Finish Level Automation loop stopped.');
    }

    runFinishLevelProtocol();
}

function stopAutomation(dependencies) {
    const { updateStatus, setIsAutomationRunning } = dependencies;
    setIsAutomationRunning(false);
    updateStatus('Finish Level Automation Stopped', 'info');
    console.log('Finish Level Automation Stopped');
    // TODO: Clean up any ongoing processes if necessary
}

module.exports = {
    startAutomation,
    stopAutomation
};
