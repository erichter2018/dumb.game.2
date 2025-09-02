function startAutomation(dependencies) {
    const { updateStatus, getIsAutomationRunning, detectBlueBoxes, redBlobDetectorDetect, performClick, captureScreenRegion, iphoneMirroringRegion, scrollUp, scrollToBottom } = dependencies;

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

    async function prepBuild(redBlobCoords) {
        updateStatus('Executing prepBuild function...', 'info');
        console.log('DEBUG: Executing prepBuild function...', 'info');
        console.log('DEBUG: Initial blue build box detection.');
        if (!getIsAutomationRunning()) return 'stopped';
        const fullScreenDataUrl = await captureScreenRegion();
        if (!getIsAutomationRunning()) return 'stopped';
        let blueBoxes = await detectBlueBoxes(fullScreenDataUrl, iphoneMirroringRegion);
        if (!getIsAutomationRunning()) return 'stopped';
        console.log('DEBUG: All blue boxes detected (before filtering for blue_build):', JSON.stringify(omitImageFromLog(blueBoxes)));
        // Consider 'blue_build' or 'unknown' states as valid blue build boxes for prepBuild
        let blueBuildBox = blueBoxes.find(box => box.state === 'blue_build' || box.state === 'unknown');
        if (!getIsAutomationRunning()) return 'stopped';
        console.log('DEBUG: blueBuildBox object (after filtering):', omitImageFromLog(blueBuildBox));
        // Only log this if blueBuildBox is not null to avoid TypeError
        if (blueBuildBox) {
            console.log(`DEBUG: Blue build box coordinates before single click: X:${blueBuildBox.x}, Y:${blueBuildBox.y}.`);
        }

        if (!blueBuildBox) {
            updateStatus('No blue build box found in prepBuild. Exiting.', 'warn');
            console.log('DEBUG: No blue build box found in prepBuild. Exiting.');
            return 'no_blue_build'; // Indicate no blue build was found
        }
        if (!getIsAutomationRunning()) return 'stopped';

        // If blue build found, click once in its center
        const blueBoxCenterX = Math.round(blueBuildBox.x + blueBuildBox.width / 2);
        const blueBoxCenterY = Math.round(blueBuildBox.y + blueBuildBox.height / 2);
        updateStatus(`Blue build box found in prepBuild. Clicking once at X:${blueBoxCenterX}, Y:${blueBoxCenterY}.`, 'info');
        console.log(`DEBUG: Blue build box found in prepBuild. Clicking at X:${blueBoxCenterX}, Y:${blueBoxCenterY}.`);
        await performClick(blueBoxCenterX, blueBoxCenterY);
        if (!getIsAutomationRunning()) return 'stopped';
        console.log(`DEBUG: Single click performed at X:${blueBoxCenterX}, Y:${blueBoxCenterY}. Waiting 500ms.`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay after click
        if (!getIsAutomationRunning()) return 'stopped';

        // Check for blue build again
        console.log('DEBUG: Re-detecting blue build box after single click.');
        const fullScreenDataUrlAfterClick = await captureScreenRegion(); // Capture new screenshot
        if (!getIsAutomationRunning()) return 'stopped';
        let blueBoxesAfterClick = await detectBlueBoxes(fullScreenDataUrlAfterClick, iphoneMirroringRegion);
        if (!getIsAutomationRunning()) return 'stopped';
        let blueBuildBoxAfterClick = blueBoxesAfterClick.find(box => box.state === 'blue_build' || box.state === 'unknown');
        if (!getIsAutomationRunning()) return 'stopped';
        console.log('DEBUG: blueBuildBoxAfterClick object:', omitImageFromLog(blueBuildBoxAfterClick));

        if (blueBuildBoxAfterClick) {
            updateStatus('Blue build still found after first click. Launching Finish Build automation.', 'info');
            console.log('DEBUG: Blue build still found. Launching Finish Build.');
            // Launch finishBuild automation
            const buildResult = await dependencies.finishBuildAutomationRunBuildProtocol(dependencies); // Corrected dependency call
            if (!getIsAutomationRunning()) return 'stopped';

            if ((buildResult === 'max_build_achieved' || buildResult === 'finish_build_launched') && !hasFinishedBuildOnce) {
                console.log('DEBUG: First successful Finish Build detected. Scrolling to bottom.');
                const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                await scrollToBottom(scrollX, scrollY, 100, 20);
                if (!getIsAutomationRunning()) return 'stopped';
                hasFinishedBuildOnce = true;
            }

            if (buildResult === 'max_build_achieved') {
                updateStatus('Finish Build reported MAX build. Exiting prepBuild.', 'success');
                console.log('DEBUG: Finish Build reported MAX build. Exiting prepBuild.');
                return 'max_build_achieved'; // Exit prepBuild but let Finish Level loop continue
            } else if (buildResult === 'no_blue_box_found') { // New: Handle explicit no blue box found
                updateStatus('Finish Build failed to find blue box. Exiting prepBuild to allow red blob detection.', 'warn');
                console.log('DEBUG: Finish Build reported no blue box found. Exiting prepBuild.');
                return 'finish_build_failed_no_blue_box'; // New return status
            }
            if (!getIsAutomationRunning()) return 'stopped';
            updateStatus('Finish Build automation completed. Exiting prepBuild.', 'success');
            console.log('DEBUG: Finish Build automation completed. Exiting prepBuild.');
            return 'finish_build_launched'; // Indicate Finish Build was launched successfully
        } else {
            updateStatus('No blue build after first click. Double clicking red blob.', 'info');
            console.log('DEBUG: No blue build after first click. Double clicking red blob.');

            let targetRedBlob = redBlobCoords; // Use provided redBlobCoords if available
            if (!targetRedBlob) {
                // If no redBlobCoords were provided, detect red blobs now
                updateStatus('No red blob coordinates provided, detecting red blobs for double click.', 'info');
                console.log('DEBUG: Detecting red blobs for double click as redBlobCoords was null.');
                const currentScreenDataUrl = await captureScreenRegion(); // Capture fresh screenshot
                if (!getIsAutomationRunning()) return 'stopped';
                const redBlobsForDoubleClick = await redBlobDetectorDetect(currentScreenDataUrl, iphoneMirroringRegion);
                if (!getIsAutomationRunning()) return 'stopped';

                if (redBlobsForDoubleClick.length > 0) {
                    targetRedBlob = redBlobsForDoubleClick.reduce((prev, current) =>
                        (prev.y > current.y) ? prev : current
                    );
                    console.log('DEBUG: Found red blob for double click:', JSON.stringify(omitImageFromLog(targetRedBlob)));
                } else {
                    updateStatus('No red blobs found for double click after first blue build click.', 'error');
                    console.error('ERROR: No red blobs found for double click.');
                    return 'no_red_blobs_found'; // New return state
                }
            }

            // Ensure targetRedBlob is not null before using it
            if (targetRedBlob) {
                if (!getIsAutomationRunning()) return 'stopped';
                const clickX = targetRedBlob.x + targetRedBlob.width / 2 + 25;
                const clickY = targetRedBlob.y + targetRedBlob.height / 2 + 25;
                console.log(`DEBUG: Double clicking red blob at X:${Math.round(clickX)}, Y:${Math.round(clickY)}.`);

                await performClick(Math.round(clickX), Math.round(clickY));
                if (!getIsAutomationRunning()) return 'stopped';
                console.log('DEBUG: First click of double click performed. Waiting 200ms.');
                await new Promise(resolve => setTimeout(resolve, 200));
                if (!getIsAutomationRunning()) return 'stopped';
                await performClick(Math.round(clickX), Math.round(clickY));
                if (!getIsAutomationRunning()) return 'stopped';
                console.log('DEBUG: Second click of double click performed. Waiting 500ms.');
                await new Promise(resolve => setTimeout(resolve, 500)); // Small delay after double click
                if (!getIsAutomationRunning()) return 'stopped';
            } else {
                // This case should ideally be covered by the !targetRedBlob check above, but as a safeguard
                updateStatus('Error: Unexpected missing red blob coordinates for double click.', 'error');
                console.error('ERROR: prepBuild called for double click with unexpected missing redBlobCoords.');
                return 'error'; // Indicate an error occurred
            }

            // Check for blue build again
            console.log('DEBUG: Re-detecting blue build box after double click.');
            const fullScreenDataUrlAfterDoubleClick = await captureScreenRegion(); // Capture new screenshot
            if (!getIsAutomationRunning()) return 'stopped';
            let blueBoxesAfterDoubleClick = await detectBlueBoxes(fullScreenDataUrlAfterDoubleClick, iphoneMirroringRegion);
            if (!getIsAutomationRunning()) return 'stopped';
            let blueBuildBoxAfterDoubleClick = blueBoxesAfterDoubleClick.find(box => box.state === 'blue_build' || box.state === 'unknown');
            if (!getIsAutomationRunning()) return 'stopped';
            console.log('DEBUG: blueBuildBoxAfterDoubleClick object:', omitImageFromLog(blueBuildBoxAfterDoubleClick));

            if (blueBuildBoxAfterDoubleClick) {
                updateStatus('Blue build found after double click. Launching Finish Build automation.', 'info');
                console.log('DEBUG: Blue build found after double click. Launching Finish Build.');
                const buildResult = await dependencies.finishBuildAutomationRunBuildProtocol(dependencies); // Corrected dependency call
                if (!getIsAutomationRunning()) return 'stopped';

                if ((buildResult === 'max_build_achieved' || buildResult === 'finish_build_launched') && !hasFinishedBuildOnce) {
                    console.log('DEBUG: First successful Finish Build detected. Scrolling to bottom.');
                    const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                    const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                    await scrollToBottom(scrollX, scrollY, 100, 20);
                    if (!getIsAutomationRunning()) return 'stopped';
                    hasFinishedBuildOnce = true;
                }

                if (buildResult === 'max_build_achieved') {
                    updateStatus('Finish Build reported MAX build. Exiting prepBuild.', 'success');
                    console.log('DEBUG: Finish Build reported MAX build. Exiting prepBuild.');
                    return 'max_build_achieved'; // Exit prepBuild but let Finish Level loop continue
                }
                if (!getIsAutomationRunning()) return 'stopped';
                updateStatus('Finish Build automation completed. Exiting prepBuild.', 'success');
                console.log('DEBUG: Finish Build automation completed. Exiting prepBuild.');
                return 'finish_build_launched';
            } else {
                updateStatus('No blue build found even after double click on red blob. Exiting prepBuild.', 'error');
                console.log('DEBUG: No blue build found after double click. Exiting prepBuild.');
                return 'no_blue_build';
            }
        }
    }

    async function exitAndStartNewLevel(dependencies) {
        const { performClick, updateStatus, CLICK_AREAS, getIsAutomationRunning } = dependencies;

        updateStatus('Starting "Exit and Start New Level" routine.', 'info');
        console.log('DEBUG: Starting "Exit and Start New Level" routine. Performing initial click at "Start Exiting".');
        await performClick(CLICK_AREAS.START_EXITING.x, CLICK_AREAS.START_EXITING.y);
        updateStatus('Clicked "Start Exiting".', 'info');
        console.log(`DEBUG: Finished click at "Start Exiting" at (${CLICK_AREAS.START_EXITING.x}, ${CLICK_AREAS.START_EXITING.y}). Waiting 500ms.`);

        // Wait 500ms
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!getIsAutomationRunning()) { return; }

        // Click at "confirm exit"
        console.log('DEBUG: Continuing "Exit and Start New Level" routine. Performing click at "Confirm Exit".');
        await performClick(CLICK_AREAS.CONFIRM_EXIT.x, CLICK_AREAS.CONFIRM_EXIT.y);
        updateStatus('Clicked "Confirm Exit".', 'info');
        console.log(`DEBUG: Finished click at "Confirm Exit" at (${CLICK_AREAS.CONFIRM_EXIT.x}, ${CLICK_AREAS.CONFIRM_EXIT.y}). Waiting 10,000ms.`);

        // Wait 10,000ms
        await new Promise(resolve => setTimeout(resolve, 10000));
        if (!getIsAutomationRunning()) { return; }

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

        updateStatus('"Exit and Start New Level" routine completed.', 'success');
        console.log('DEBUG: "Exit and Start New Level" routine completed.');
        // After successfully exiting and starting a new level, scroll down to the bottom
        console.log('DEBUG: Exit and Start New Level routine complete. Scrolling to bottom.');
        // Using central coordinates of the iPhone mirroring region and a default scroll distance
        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
        await scrollToBottom(scrollX, scrollY, 100, 20); // The count (20) is now fixed within scrollToBottom
        if (!getIsAutomationRunning()) { return; }
    }

    let scrollUpCount = 0; // Counter for consecutive scroll-up attempts
    let detectionAttemptCount = 0; // Counter for detection attempts within current scroll position

    async function runFinishLevelProtocol() {
        while (getIsAutomationRunning()) {
            updateStatus('Checking for blue build box...', 'info');
            const fullScreenDataUrl = await captureScreenRegion();
            const blueBoxes = await detectBlueBoxes(fullScreenDataUrl, iphoneMirroringRegion);
            const blueBuildBox = blueBoxes.find(box => box.state === 'blue_build' || box.state === 'grey_build');

            if (blueBuildBox) {
                detectionAttemptCount = 0; // Reset on success
                scrollUpCount = 0; // Reset on success
                updateStatus('Blue build box found. Launching prepBuild.', 'info');
                console.log('DEBUG: Blue build box found. Launching prepBuild.');
                redBlobsTried.clear(); // Reset tried blobs if a blue box is found and build is about to start
                const result = await prepBuild(null);
                if (!getIsAutomationRunning()) break; // Exit loop if automation stopped during prepBuild

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
                    continue; // After exiting and starting a new level, the loop continues to re-detect
                }

                // If no red blobs are found at all (after checking for exit level blob)
                if (redBlobs.length === 0) {
                    updateStatus('No red blobs found (excluding named exit level blob if present). Trying again in 1 second...', 'warn');
                    console.log('DEBUG: No red blobs found (excluding named exit level blob if present). Trying again in 1 second...');
                    redBlobsTried.clear(); // Clear tried blobs if no red blobs are found at all
                    lastRedBlobCoords = null; // Clear if no red blobs are found at all
                    detectionAttemptCount++; // Increment attempt count
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before re-attempting

                    if (detectionAttemptCount >= 3) {
                        console.log(`DEBUG: No red blobs or blue boxes found after ${detectionAttemptCount} attempts. Scrolling up.`);
                        updateStatus(`No objects found after ${detectionAttemptCount} attempts. Scrolling up...`, 'warn');
                        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                        await scrollUp(scrollX, scrollY, 200); // Scroll up by 200 pixels
                        scrollUpCount++;
                        detectionAttemptCount = 0; // Reset attempt count after scrolling

                        if (scrollUpCount >= 20) {
                            console.log(`DEBUG: Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search.`);
                            updateStatus(`Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search...`, 'warn');
                            await scrollToBottom(scrollX, scrollY, 100, 20); // Scroll to bottom, then the loop restarts from top
                            scrollUpCount = 0; // Reset scroll up count
                        }
                    }
                    continue; // Continue the loop to re-detect from scratch
                }

                if (redBlobs.length > 0) {
                    detectionAttemptCount = 0; // Reset on success
                    scrollUpCount = 0; // Reset on success
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
                        }

                        if (untriedRedBlobs.length > 0) {
                            // Select the one with the highest Y-axis from untried blobs
                            targetBlob = untriedRedBlobs.reduce((prev, current) =>
                                (prev.y > current.y) ? prev : current
                            );
                            updateStatus('No last clicked red blob or not found, selecting highest Y-axis untried red blob.', 'info');
                            console.log('DEBUG: No last clicked red blob or not found, selecting highest Y-axis untried red blob:', JSON.stringify(omitImageFromLog(targetBlob)));
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
                            lastRedBlobCoords = targetBlob; // Store the last successfully clicked red blob
                            updateStatus('Finish Build automation successfully launched from prepBuild after red blob click.', 'info');
                            console.log('DEBUG: Finish Build automation successfully launched after red blob click.');

                            if (!hasFinishedBuildOnce) {
                                console.log('DEBUG: First successful Finish Build detected after red blob click. Scrolling to bottom.');
                                const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                                const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                                await scrollToBottom(scrollX, scrollY, 100, 20);
                                if (!getIsAutomationRunning()) break;
                                hasFinishedBuildOnce = true;
                            }
                        } else if (prepBuildResult === 'no_blue_build' || prepBuildResult === 'no_red_blobs_found' || prepBuildResult === 'finish_build_failed_no_blue_box') {
                            redBlobsTried.add(JSON.stringify(targetBlob));
                            lastRedBlobCoords = null; // Clear if not successful
                            updateStatus('No blue build or red blobs found after red blob click. Trying another red blob.', 'warn');
                            console.log('DEBUG: No blue build or red blobs found after red blob click. Marking as tried.');
                        }
                    } else {
                        updateStatus('No untried red blobs found after reset. Continuing...', 'warn');
                        console.log('DEBUG: No untried red blobs after reset.');
                    }

                } else {
                    updateStatus('No red blobs found. Trying again in 1 second...', 'warn');
                    console.log('DEBUG: No red blobs found. Trying again in 1 second...');
                    redBlobsTried.clear(); // Clear tried blobs if no red blobs are found at all
                    lastRedBlobCoords = null; // Clear if no red blobs are found
                    detectionAttemptCount++; // Increment attempt count
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before re-attempting

                    if (detectionAttemptCount >= 3) {
                        console.log(`DEBUG: No red blobs found after ${detectionAttemptCount} attempts. Scrolling up.`);
                        updateStatus(`No objects found after ${detectionAttemptCount} attempts. Scrolling up...`, 'warn');
                        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                        await scrollUp(scrollX, scrollY, 200); // Scroll up by 200 pixels
                        scrollUpCount++;
                        detectionAttemptCount = 0; // Reset attempt count after scrolling

                        if (scrollUpCount >= 20) {
                            console.log(`DEBUG: Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search.`);
                            updateStatus(`Scrolled up ${scrollUpCount} times. Scrolling to bottom and restarting search...`, 'warn');
                            await scrollToBottom(scrollX, scrollY, 100, 20); // Scroll to bottom, then the loop restarts from top
                            scrollUpCount = 0; // Reset scroll up count
                        }
                    }
                    // Do not `continue` here, let the main loop handle the 2-second delay for consistency.
                }
            }
            if (!getIsAutomationRunning()) break; // Check if automation stopped before next delay
            await new Promise(resolve => setTimeout(resolve, 2000)); // Small delay before next loop iteration
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
