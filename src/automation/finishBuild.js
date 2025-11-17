const blueBoxDetector = require('../detection/blueBoxDetector');
const redBlobDetector = require('../detection/redBlobDetector');
const settingsManager = require('../../lib/settingsManager');
const { captureBuildName } = require('../../utils/ocr');

// Global variables for custom triggers
let levelStartTime = Date.now(); // Track when level started
let triggeredActions = new Set(); // Track which triggers have already fired during this level

// Function to reset custom trigger state for new level
// This ensures each trigger only fires ONCE per level, even if the condition is met multiple times
// Example: If "Tomato" build appears in build 1 and build 5, the trigger only fires on build 1
function resetCustomTriggerState() {
    levelStartTime = Date.now();
    triggeredActions.clear();
    console.log('DEBUG: Custom trigger state reset for new level - all triggers can fire again');
}

// Custom trigger detection and execution during build
async function checkCustomTriggersDuringBuild(levelName, buildNumber, elapsedTime, direction, buildName, dependencies) {
    try {
        // Normalize level name to match how it's stored in settings
        const normalizedLevelName = levelName ? levelName.toLowerCase().trim() : '';
        console.log(`DEBUG: checkCustomTriggersDuringBuild called for level: "${levelName}" -> normalized: "${normalizedLevelName}", build: ${buildNumber}, elapsed: ${elapsedTime}ms, direction: ${direction}, buildName: "${buildName}"`);
        
        const triggers = settingsManager.getCustomTriggers(normalizedLevelName, direction);
        console.log(`DEBUG: Found ${triggers ? triggers.length : 0} custom triggers for level "${normalizedLevelName}" (${direction} direction)`);
        console.log(`DEBUG: Triggers array:`, JSON.stringify(triggers));
        console.log(`DEBUG: Triggers is array?`, Array.isArray(triggers));
        
        if (!triggers || triggers.length === 0) {
            console.log(`DEBUG: No custom triggers found for level "${normalizedLevelName}"`);
            return;
        }

        for (let i = 0; i < triggers.length; i++) {
            const trigger = triggers[i];
            const triggerTiming = trigger.timing || 'during'; // Default to 'during' for backward compatibility
            const triggerKey = `${trigger.triggerType}-${trigger.triggerValue}-${i}`;
            
            console.log(`DEBUG: Checking trigger ${i}: ${triggerTiming} ${trigger.triggerType}:${trigger.triggerValue} -> ${trigger.action}`);
            
            // Only check "during" triggers in this function
            if (triggerTiming !== 'during') {
                console.log(`DEBUG: Trigger ${i} is an AFTER trigger, skipping for now`);
                continue;
            }
            
            // Skip if already triggered during this level (triggers only fire ONCE per level)
            if (triggeredActions.has(triggerKey)) {
                console.log(`DEBUG: Trigger ${i} (${trigger.triggerType}:${trigger.triggerValue}) already fired this level, skipping`);
                continue;
            }

            let shouldTrigger = false;

            // Check trigger conditions (use loose equality to handle string/number mismatch)
            if (trigger.triggerType === 'buildNumber' && buildNumber == trigger.triggerValue) {
                shouldTrigger = true;
                console.log(`DEBUG: Build number trigger condition met: ${buildNumber} == ${trigger.triggerValue}`);
            } else if (trigger.triggerType === 'timeSpent' && elapsedTime >= trigger.triggerValue) {
                shouldTrigger = true;
                console.log(`DEBUG: Time spent trigger condition met: ${elapsedTime}ms >= ${trigger.triggerValue}ms`);
            } else if (trigger.triggerType === 'buildName' && buildName) {
                // Case-insensitive "contains" match
                const normalizedBuildName = buildName.toLowerCase();
                const normalizedTriggerValue = String(trigger.triggerValue).toLowerCase();
                if (normalizedBuildName.includes(normalizedTriggerValue)) {
                    // For "during" timing, also check if enough time has elapsed (actionParams)
                    if (trigger.timing === 'during') {
                        const minTimeMs = trigger.actionParams || 0;
                        if (elapsedTime >= minTimeMs) {
                            shouldTrigger = true;
                            console.log(`DEBUG: Build name trigger condition met: "${buildName}" contains "${trigger.triggerValue}" AND elapsed time ${elapsedTime}ms >= ${minTimeMs}ms`);
                        } else {
                            console.log(`DEBUG: Build name matched "${buildName}" but time ${elapsedTime}ms < required ${minTimeMs}ms - not firing yet`);
                        }
                    } else {
                        // "after" timing - fire immediately when build completes
                        shouldTrigger = true;
                        console.log(`DEBUG: Build name trigger condition met: "${buildName}" contains "${trigger.triggerValue}"`);
                    }
                }
            }

            if (shouldTrigger) {
                console.log(`DEBUG: Custom trigger FIRING (first time this level) - ${trigger.triggerType}:${trigger.triggerValue} -> ${trigger.action}`);
                triggeredActions.add(triggerKey); // Mark as fired for the rest of this level
                console.log(`DEBUG: Trigger marked as fired, will not fire again until next level`);
                const result = await executeTriggerActionDuringBuild(trigger, dependencies);
                // If clickaround was executed, return immediately (blue build box disappears)
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                if (result === 'custom_trigger_clickaround_completed') {
                    return result;
                }
                // If activeSkill was executed, return immediately (blue build box disappears)
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                if (result === 'custom_trigger_activeskill_completed') {
                    return result;
                }
            }
        }
    } catch (error) {
        console.error('Error checking custom triggers during build:', error);
    }
    return null; // No clickaround executed
}

// Custom trigger detection and execution AFTER build completes
async function checkCustomTriggersAfterBuild(levelName, buildNumber, elapsedTime, direction, buildName, dependencies) {
    try {
        // Normalize level name to match how it's stored in settings
        const normalizedLevelName = levelName ? levelName.toLowerCase().trim() : '';
        console.log(`DEBUG: checkCustomTriggersAfterBuild called for level: "${levelName}" -> normalized: "${normalizedLevelName}", build: ${buildNumber}, elapsed: ${elapsedTime}ms, direction: ${direction}, buildName: "${buildName}"`);
        
        const triggers = settingsManager.getCustomTriggers(normalizedLevelName, direction);
        console.log(`DEBUG: Found ${triggers ? triggers.length : 0} custom triggers for level "${normalizedLevelName}" (${direction} direction) - checking AFTER triggers`);
        
        if (!triggers || triggers.length === 0) {
            console.log(`DEBUG: No custom triggers found for level "${normalizedLevelName}"`);
            return;
        }

        for (let i = 0; i < triggers.length; i++) {
            const trigger = triggers[i];
            const triggerTiming = trigger.timing || 'during'; // Default to 'during' for backward compatibility
            const triggerKey = `${trigger.triggerType}-${trigger.triggerValue}-${i}`;
            
            console.log(`DEBUG: Checking trigger ${i}: ${triggerTiming} ${trigger.triggerType}:${trigger.triggerValue} -> ${trigger.action}`);
            
            // Only check "after" triggers in this function
            if (triggerTiming !== 'after') {
                console.log(`DEBUG: Trigger ${i} is a DURING trigger, skipping`);
                continue;
            }
            
            // Skip if already triggered during this level (triggers only fire ONCE per level)
            if (triggeredActions.has(triggerKey)) {
                console.log(`DEBUG: Trigger ${i} (${trigger.triggerType}:${trigger.triggerValue}) already fired this level, skipping`);
                continue;
            }

            let shouldTrigger = false;

            // Check trigger conditions (use loose equality to handle string/number mismatch)
            if (trigger.triggerType === 'buildNumber' && buildNumber == trigger.triggerValue) {
                shouldTrigger = true;
                console.log(`DEBUG: Build number trigger condition met: ${buildNumber} == ${trigger.triggerValue}`);
            } else if (trigger.triggerType === 'timeSpent' && elapsedTime >= trigger.triggerValue) {
                shouldTrigger = true;
                console.log(`DEBUG: Time spent trigger condition met: ${elapsedTime}ms >= ${trigger.triggerValue}ms`);
            } else if (trigger.triggerType === 'buildName' && buildName) {
                // Case-insensitive "contains" match
                const normalizedBuildName = buildName.toLowerCase();
                const normalizedTriggerValue = String(trigger.triggerValue).toLowerCase();
                if (normalizedBuildName.includes(normalizedTriggerValue)) {
                    // For "during" timing, also check if enough time has elapsed (actionParams)
                    if (trigger.timing === 'during') {
                        const minTimeMs = trigger.actionParams || 0;
                        if (elapsedTime >= minTimeMs) {
                            shouldTrigger = true;
                            console.log(`DEBUG: Build name trigger condition met: "${buildName}" contains "${trigger.triggerValue}" AND elapsed time ${elapsedTime}ms >= ${minTimeMs}ms`);
                        } else {
                            console.log(`DEBUG: Build name matched "${buildName}" but time ${elapsedTime}ms < required ${minTimeMs}ms - not firing yet`);
                        }
                    } else {
                        // "after" timing - fire immediately when build completes
                        shouldTrigger = true;
                        console.log(`DEBUG: Build name trigger condition met: "${buildName}" contains "${trigger.triggerValue}"`);
                    }
                }
            }

            if (shouldTrigger) {
                console.log(`DEBUG: Custom trigger FIRING AFTER build completes (first time this level) - ${trigger.triggerType}:${trigger.triggerValue} -> ${trigger.action}`);
                triggeredActions.add(triggerKey); // Mark as fired for the rest of this level
                console.log(`DEBUG: Trigger marked as fired, will not fire again until next level`);
                const result = await executeTriggerActionDuringBuild(trigger, dependencies);
                // If clickaround was executed, return immediately (blue build box disappears)
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                if (result === 'custom_trigger_clickaround_completed') {
                    return result;
                }
                // If activeSkill was executed, return immediately (blue build box disappears)
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                if (result === 'custom_trigger_activeskill_completed') {
                    return result;
                }
            }
        }
    } catch (error) {
        console.error('Error checking custom triggers after build:', error);
    }
    return null; // No clickaround executed
}

async function executeTriggerActionDuringBuild(trigger, dependencies) {
    const { performClick, scrollUp, scrollDown, updateStatus, updateCurrentFunction, captureScreenRegion, redBlobDetectorDetect, scrollUpWithDistance, iphoneMirroringRegion, CLICK_AREAS } = dependencies;

    try {
        switch (trigger.action) {
            case 'clickAround':
                updateCurrentFunction('customTrigger-clickAround');
                updateStatus(`Custom trigger: Click Around with ${trigger.clickaroundOptions?.clickaroundChunks || 1} chunk(s)`, 'info');
                
                // Use the REAL clickAround function from clickAround.js (not the simplified version)
                const clickAroundDependencies = {
                    updateStatus: dependencies.updateStatus,
                    detectRedBlobs: dependencies.redBlobDetectorDetect,
                    performClick: dependencies.performClick,
                    performBatchedClicks: dependencies.performBatchedClicks || (async (clickArray) => {
                        console.warn('WARNING: Using performBatchedClicks FALLBACK - this will be much slower!');
                        if (!Array.isArray(clickArray)) return { success: false, error: 'Invalid click array' };
                        for (const click of clickArray) {
                            await dependencies.performClick(click.x, click.y);
                        }
                        return { success: true };
                    }),
                    iphoneMirroringRegion: dependencies.iphoneMirroringRegion,
                    updateCurrentFunction: dependencies.updateCurrentFunction,
                    CLICK_AREAS: dependencies.CLICK_AREAS,
                    captureScreenRegion: dependencies.captureScreenRegion,
                    sendDetectionResults: (detections) => {
                        if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
                            dependencies.mainWindow.webContents.send('detection-results', detections);
                        }
                    },
                    getIsClickAroundRunning: () => dependencies.getIsAutomationRunning(),
                    getIsClickAroundPaused: () => false,
                    scrollToBottom: dependencies.scrollToBottom,
                    scrollSwipeDistance: dependencies.scrollSwipeDistance,
                    scrollToBottomIterations: dependencies.scrollToBottomIterations,
                    compareBottomRegions: dependencies.compareBottomRegions,
                    captureBottomRegion: dependencies.captureBottomRegion,
                };
                
                const { clickAround } = require('./clickAround');
                await clickAround(clickAroundDependencies, trigger.clickaroundOptions?.excludeRedBlobs ?? true, trigger.clickaroundOptions || {});
                
                // After clickaround, build box disappears - exit runBuildProtocol so finishLevel can find next red blob
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                console.log('DEBUG: Custom trigger clickaround completed - blue box disappeared, exiting runBuildProtocol immediately');
                return 'custom_trigger_clickaround_completed';

            case 'scrollUp':
                updateCurrentFunction('customTrigger-scrollUp');
                const scrollUpDistance = trigger.actionDistance || 200;
                updateStatus(`Custom trigger: Scroll Up ${scrollUpDistance}px`, 'info');
                // Click off before scrolling
                if (dependencies.performClick && dependencies.CLICK_AREAS && dependencies.CLICK_AREAS.CLICK_OFF) {
                    await dependencies.performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                    await new Promise(resolve => setTimeout(resolve, 200)); // Brief delay after click off
                }
                const scrollUpX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                const scrollUpY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                await scrollUpWithDistance(scrollUpX, scrollUpY, scrollUpDistance);
                break;

            case 'scrollDown':
                updateCurrentFunction('customTrigger-scrollDown');
                const scrollDownDistance = trigger.actionDistance || 200;
                updateStatus(`Custom trigger: Scroll Down ${scrollDownDistance}px`, 'info');
                // Click off before scrolling
                if (dependencies.performClick && dependencies.CLICK_AREAS && dependencies.CLICK_AREAS.CLICK_OFF) {
                    await dependencies.performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                    await new Promise(resolve => setTimeout(resolve, 200)); // Brief delay after click off
                }
                const scrollDownX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                const scrollDownY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                await scrollDown(scrollDownX, scrollDownY, scrollDownDistance);
                break;
            
            case 'scrollToTop':
                updateCurrentFunction('customTrigger-scrollToTop');
                updateStatus(`Custom trigger: Scroll to Top`, 'info');
                // Click off before scrolling
                if (dependencies.performClick && dependencies.CLICK_AREAS && dependencies.CLICK_AREAS.CLICK_OFF) {
                    await dependencies.performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                    await new Promise(resolve => setTimeout(resolve, 200)); // Brief delay after click off
                }
                const { scrollToTop } = require('./scrolling');
                await scrollToTop({ 
                    updateCurrentFunction: dependencies.updateCurrentFunction,
                    performClick: dependencies.performClick,
                    CLICK_AREAS: dependencies.CLICK_AREAS,
                    iphoneMirroringRegion: dependencies.iphoneMirroringRegion
                });
                break;
            
            case 'scrollToBottom':
                updateCurrentFunction('customTrigger-scrollToBottom');
                updateStatus(`Custom trigger: Scroll to Bottom`, 'info');
                // Click off before scrolling
                if (dependencies.performClick && dependencies.CLICK_AREAS && dependencies.CLICK_AREAS.CLICK_OFF) {
                    await dependencies.performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                    await new Promise(resolve => setTimeout(resolve, 200)); // Brief delay after click off
                }
                const scrollToBottomX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                const scrollToBottomY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                await dependencies.scrollToBottom(scrollToBottomX, scrollToBottomY, dependencies.scrollSwipeDistance, dependencies.scrollToBottomIterations, {
                    updateCurrentFunction: dependencies.updateCurrentFunction,
                    performClick: dependencies.performClick,
                    CLICK_AREAS: dependencies.CLICK_AREAS
                });
                break;
            
            case 'activeSkill':
                updateCurrentFunction('customTrigger-activeSkill');
                updateStatus(`Custom trigger: Active Skill`, 'info');
                const { activateActiveSkill } = require('./activeSkill');
                await activateActiveSkill({
                    performClick: dependencies.performClick,
                    scrollDown: dependencies.scrollDown,
                    CLICK_AREAS: dependencies.CLICK_AREAS,
                    iphoneMirroringRegion: dependencies.iphoneMirroringRegion,
                    updateStatus: dependencies.updateStatus,
                    updateCurrentFunction: dependencies.updateCurrentFunction
                });
                // Active skill completed - blue build box disappears, so exit build protocol immediately
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                console.log('DEBUG: Custom trigger activeSkill completed - blue box disappeared, exiting build protocol immediately');
                return 'custom_trigger_activeskill_completed';

            default:
                console.log(`DEBUG: Unknown trigger action: ${trigger.action}`);
        }
    } catch (error) {
        console.error('Error executing trigger action during build:', error);
    }
}

// DEPRECATED: This simplified clickAround function has been replaced with the real clickAround from clickAround.js
// Keeping this commented out for reference in case we need to restore it
/*
async function executeClickAroundDuringBuild(durationMs, clickaroundOptions, dependencies) {
    const { performClick, updateStatus, captureScreenRegion, redBlobDetectorDetect, iphoneMirroringRegion, getIsAutomationRunning } = dependencies;
    
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    
    const options = clickaroundOptions || {
        excludeRedBlobs: true,
        clickaroundChunks: 3,
        scrollUpDistance: 200,
        scrollUpCount: 5,
        initialScrollDown: 150,
        scrollToBottomAtEnd: false
    };
    
    console.log(`DEBUG: Starting clickAround during build for ${durationMs}ms with options:`, options);
    
    while (Date.now() < endTime && getIsAutomationRunning()) {
        // Check for pause state and wait if paused
        if (dependencies.waitIfPaused) {
            await dependencies.waitIfPaused();
        }
        if (!getIsAutomationRunning()) return null; // Check again after pause
        
        // Capture screen and detect red blobs
        const fullScreenDataUrl = await captureScreenRegion();
        const redBlobs = await redBlobDetectorDetect(fullScreenDataUrl, iphoneMirroringRegion);
        
        // Filter out excluded blobs
        const clickableBlobs = redBlobs.filter(blob => {
            if (options.excludeRedBlobs && (blob.name === 'exit level' || blob.name === 'research')) {
                return false;
            }
            return true;
        });
        
        if (clickableBlobs.length > 0) {
            // Pick a random blob to click
            const randomBlob = clickableBlobs[Math.floor(Math.random() * clickableBlobs.length)];
            const clickX = randomBlob.x + randomBlob.width / 2;
            const clickY = randomBlob.y + randomBlob.height / 2;
            
            console.log(`DEBUG: Clicking around at (${clickX}, ${clickY}) during build`);
            await performClick(clickX, clickY);
        }
        
        // Small delay between clicks
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`DEBUG: ClickAround during build completed`);
}
*/


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

async function holdBlueBox(coords, duration, dependencies, levelName) {
    const { clickDown, clickUp, setIsHoldingBlueBox, setlastBlueBoxClickCoords, updateStatus, clickAndHold, getIsAutomationRunning, captureScreenRegion, detectBlueBoxes, iphoneMirroringRegion } = dependencies;
    
    if (!coords || coords.x === null || coords.y === null) {
        console.error('ERROR: Attempted to hold blue box with null or invalid coordinates.', coords);
        updateStatus('Error: Attempted to hold blue box with invalid coordinates.', 'error');
        setIsHoldingBlueBox(false);
        return; // Exit if coordinates are invalid
    }

    // Get duration from settings if levelName is provided
    let actualDuration = duration;
    if (levelName) {
        const levelSettings = settingsManager.getLevelSettings(levelName);
        actualDuration = levelSettings.blueBoxClickHoldDuration;
        console.log(`DEBUG: Using click hold duration from settings for "${levelName}": ${actualDuration}ms`);
    }

    updateStatus(`Initiating ${actualDuration / 1000}-second click-hold at (${coords.x}, ${coords.y}).`, 'info');
    console.log(`DEBUG: Initiating ${actualDuration / 1000}-second click-hold at (${coords.x}, ${coords.y}).`);
    
    setlastBlueBoxClickCoords(coords); // Store coords to be able to release on interruption
    setIsHoldingBlueBox(true); // Indicate that a click-hold is active
    
    // Create callback to check if build is complete (grey_max) during hold
    const checkBuildComplete = async () => {
        if (!captureScreenRegion || !detectBlueBoxes) {
            return false; // Can't check without detection functions
        }
        
        try {
            const checkStartTime = Date.now();
            const screenCapture = await captureScreenRegion();
            const captureTime = Date.now() - checkStartTime;
            
            const detectStartTime = Date.now();
            const blueBoxes = await detectBlueBoxes(screenCapture, iphoneMirroringRegion);
            const detectTime = Date.now() - detectStartTime;
            
            const totalCheckTime = Date.now() - checkStartTime;
            console.log(`DEBUG: [TIMING] Max build check: capture=${captureTime}ms, detect=${detectTime}ms, total=${totalCheckTime}ms`);
            
            // Check if the box at our SPECIFIC coordinates is grey_max
            // (not just any grey_max box on screen)
            const PROXIMITY_THRESHOLD = 50; // pixels - box should be near our hold coordinates
            const boxAtOurCoords = blueBoxes.find(box => {
                const boxCenterX = box.x + box.width / 2;
                const boxCenterY = box.y + box.height / 2;
                const distance = Math.sqrt(Math.pow(boxCenterX - coords.x, 2) + Math.pow(boxCenterY - coords.y, 2));
                return distance <= PROXIMITY_THRESHOLD;
            });
            
            if (boxAtOurCoords && boxAtOurCoords.state === 'grey_max') {
                console.log(`DEBUG: Build at our coordinates (${coords.x}, ${coords.y}) reached MAX during hold, stopping hold early`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('DEBUG: Error checking build completion during hold:', error);
            return false;
        }
    };
    
    console.log(`DEBUG: Attempting to click down at (${coords.x}, ${coords.y}) for holdBlueBox.`);
    // Use the interruptible clickAndHold from main.js with early exit callback
    const holdResult = await clickAndHold(coords.x, coords.y, actualDuration, getIsAutomationRunning, checkBuildComplete);
    
    if (holdResult.stoppedEarly) {
        console.log('DEBUG: Click-hold stopped early (build completed)');
    }
    console.log('DEBUG: Releasing click-hold at ' + (coords ? `(${coords.x}, ${coords.y})` : 'null') + '.');
    setIsHoldingBlueBox(false); // Indicate that click-hold is no longer active
    
    return holdResult; // Return result so caller knows if hold stopped early
}

async function checkResearchBlob(dependencies, levelName) {
    const { updateStatus, redBlobDetectorDetect, captureScreenRegion, iphoneMirroringRegion, getIsAutomationRunning } = dependencies;

    // Check if research should be done for this level
    if (levelName) {
        const levelSettings = settingsManager.getLevelSettings(levelName);
        if (!levelSettings.doResearch) {
            console.log(`DEBUG: Research disabled for level "${levelName}", skipping research check`);
            return false;
        }
    }

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
    await performRapidClicks(CLICK_AREAS.INDIVIDUAL_RESEARCH.x, CLICK_AREAS.INDIVIDUAL_RESEARCH.y, 100);
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
        // Check for pause state and wait if paused
        if (dependencies.waitIfPaused) {
            await dependencies.waitIfPaused();
        }
        if (!getIsAutomationRunning()) break; // Check again after pause
        
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
    const { updateStatus, getIsAutomationRunning, scrollToBottom, scrollSwipeDistance, updateCurrentFunction, originalRedBlobCoords, getCurrentLevelName, confirmedBlueBuildBox, captureScreenRegion } = dependencies;

    const startTime = Date.now();
    
    // Predictive red blob detection: cache red blob coords found during build
    let cachedRedBlobCoords = null;
    let lastRedBlobDetectionTime = 0;
    const RED_BLOB_DETECTION_INTERVAL = 2000; // Check every 2 seconds during build
    let exitLevelDetected = false;
    
    // Get level-specific settings (use the settings-compatible name)
    const currentLevelName = getCurrentLevelName ? getCurrentLevelName() : '';
    const settingsLevelName = dependencies.getLevelNameForSettings ? dependencies.getLevelNameForSettings() : currentLevelName;
    
    // Get the ACTUAL effective direction being used (not the saved preference)
    const effectiveDirection = (dependencies.getEffectiveDirection ? dependencies.getEffectiveDirection() : null) 
        || (dependencies.getEffectiveDirectionForLevel ? dependencies.getEffectiveDirectionForLevel() : null);
    
    // Get global settings and direction-specific settings separately
    const globalSettings = settingsManager.getLevelSettings(settingsLevelName);
    const directionSettings = effectiveDirection 
        ? settingsManager.getDirectionSettings(settingsLevelName, effectiveDirection)
        : {};
    
    // Merge global and direction-specific settings, prioritizing direction-specific for build actions
    const levelSettings = {
        ...globalSettings,
        ...directionSettings
    };
    
    console.log(`DEBUG: Loading settings for "${settingsLevelName}" with effective direction: ${effectiveDirection || 'unknown (using saved preference)'}`);
    
    const buildNumber = dependencies.getBuildNumberForCurrentLevel ? dependencies.getBuildNumberForCurrentLevel() : 1;
    const minBuildCount = dependencies.getMinimumBuildCount ? dependencies.getMinimumBuildCount(currentLevelName) : null;
    console.log(`DEBUG: runBuildProtocol - Level: "${currentLevelName}", buildNumber: ${buildNumber}, minBuildCount: ${minBuildCount}`);
    
    // Variable to store build name (will be captured via OCR)
    let buildName = '';
    
    // Format build number display with "X/Y" if minimum build count is available
    const buildDisplay = minBuildCount ? `${buildNumber}/${minBuildCount}` : `${buildNumber}`;
    console.log(`DEBUG: runBuildProtocol - buildDisplay: "${buildDisplay}"`);
    updateCurrentFunction(`runBuildProtocol ${buildDisplay}`); // Update current function display with build number
    
    // Mark that finishBuild is being run for this level (after getting the build number)
    if (dependencies.markFinishBuildRunForCurrentLevel) {
        dependencies.markFinishBuildRunForCurrentLevel();
    }
    
    // Get build actions from settings
    const firstBuildAction = levelSettings.firstBuildAction || { action: 'nothing', triggerTimeMs: null };
    const secondBuildAction = levelSettings.secondBuildAction || { action: 'nothing', triggerTimeMs: null };
    
    // Get max build time from settings (default 3 minutes if not specified)
    const maxBuildTimeMs = levelSettings.maxBuildTimeMs || 180000;
    
    console.log(`DEBUG: Build actions from settings for "${settingsLevelName}"${currentLevelName !== settingsLevelName ? ` (internal name: "${currentLevelName}")` : ''}:`, {
        first: firstBuildAction,
        second: secondBuildAction,
        buildNumber: buildNumber
    });
    
    // Determine which action to use based on build number
    // Only first and second builds have actions; third+ builds have no actions
    let currentBuildAction = { action: 'nothing', triggerTimeMs: null };
    if (buildNumber === 1) {
        currentBuildAction = firstBuildAction;
    } else if (buildNumber === 2) {
        currentBuildAction = secondBuildAction;
    }
    const actionTriggerTime = currentBuildAction.triggerTimeMs;
    
    console.log(`DEBUG: Build #${buildNumber} - Using action: ${currentBuildAction.action} at ${actionTriggerTime}ms`);
    
    let timerInterval = null; // To hold the interval ID for clearing

    try {
        // Set up an interval to update the timer in the UI
        timerInterval =         setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const minutes = Math.floor(elapsedTime / 60000);
            const seconds = Math.floor((elapsedTime % 60000) / 1000);
            const nameDisplay = buildName ? ` ${buildName}` : '';
            updateCurrentFunction(`runBuildProtocol ${buildDisplay}${nameDisplay} (${minutes}m ${seconds}s)`);
        }, 1000); // Update every second

        // Step 1: Use confirmed blue box from prepBuild if available, otherwise detect
        let initialDetectedBox;
        if (confirmedBlueBuildBox) {
            // Use the confirmed box from prepBuild - skip redundant detection
            initialDetectedBox = {
                ...confirmedBlueBuildBox,
                coords: {
                    x: Math.round(confirmedBlueBuildBox.x + confirmedBlueBuildBox.width / 2),
                    y: Math.round(confirmedBlueBuildBox.y + confirmedBlueBuildBox.height / 2),
                }
            };
            console.log('DEBUG: Using confirmed blue box from prepBuild - skipping redundant detection');
            updateStatus(`Using confirmed build box at X:${initialDetectedBox.coords.x}, Y:${initialDetectedBox.coords.y}`, 'info');
        } else {
            // No confirmed box provided, fall back to detection
            initialDetectedBox = await findBlueBoxWithRetry(dependencies, originalRedBlobCoords);
            
            if (!initialDetectedBox) {
                updateStatus('Automation cannot start: No clickable build box found after retries. Exiting.', 'error');
                return 'error'; // Return 'error' if no initial box is found
            }
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

        // Capture build name via OCR asynchronously (don't block build start)
        if (captureScreenRegion) {
            updateStatus('Capturing build name via OCR (async)...', 'info');
            // Start OCR but don't await - it will update buildName when ready
            captureBuildName(initialDetectedBox, captureScreenRegion).then(name => {
                if (name) {
                    buildName = name; // Update the variable when ready
                    console.log(`DEBUG: Build name captured asynchronously: "${buildName}"`);
                    // Update display with the build name
                    const nameDisplay = buildName ? ` ${buildName}` : '';
                    const elapsedTime = Date.now() - startTime;
                    const minutes = Math.floor(elapsedTime / 60000);
                    const seconds = Math.floor((elapsedTime % 60000) / 1000);
                    updateCurrentFunction(`runBuildProtocol ${buildDisplay}${nameDisplay} (${minutes}m ${seconds}s)`);
                } else {
                    console.log('DEBUG: Failed to capture build name asynchronously, continuing without it');
                }
            }).catch(err => {
                console.error('DEBUG: Error capturing build name:', err);
            });
        }

        // Step 2: Start a loop
        let isFirstLoopIteration = true; // Flag to skip detection on first iteration when we have confirmed box
        // Check if build action has already been executed (tracked globally to persist across interruptions)
        const actionAlreadyExecuted = dependencies.hasBuildActionBeenExecuted 
            ? dependencies.hasBuildActionBeenExecuted(currentLevelName, buildNumber) 
            : false;
        
        console.log(`DEBUG: Build action execution check - Level: "${currentLevelName}", Build: ${buildNumber}, Action: "${currentBuildAction.action}", Already executed: ${actionAlreadyExecuted}`);
        
        if (actionAlreadyExecuted && currentBuildAction.action !== 'nothing') {
            console.log(`DEBUG: Build action for "${currentLevelName}" build #${buildNumber} was already executed, will not run again`);
        }
        
        while (getIsAutomationRunning()) {
            // Check for pause state and wait if paused
            if (dependencies.waitIfPaused) {
                await dependencies.waitIfPaused();
            }
            if (!getIsAutomationRunning()) break; // Check again after pause
            
            const currentTime = Date.now();
            
            // Check if it's time to execute build action from settings
            const elapsedTime = currentTime - startTime;
            
            // FAILSAFE: Check if max build time has been exceeded
            if (elapsedTime >= maxBuildTimeMs) {
                const minutes = Math.floor(maxBuildTimeMs / 60000);
                updateStatus(`Build timeout: Max build time of ${minutes} minutes exceeded. Scrolling to bottom and stopping build.`, 'error');
                console.log(`ERROR: Build timeout: Max build time of ${maxBuildTimeMs}ms (${minutes} minutes) exceeded. Scrolling to bottom and stopping build.`);
                
                // Scroll to bottom before exiting
                if (scrollToBottom) {
                    const scrollX = dependencies.iphoneMirroringRegion.x + dependencies.iphoneMirroringRegion.width / 2;
                    const scrollY = dependencies.iphoneMirroringRegion.y + dependencies.iphoneMirroringRegion.height / 2;
                    await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, dependencies.scrollToBottomIterations || 10, { 
                        updateCurrentFunction, 
                        performClick: dependencies.performClick, 
                        CLICK_AREAS: dependencies.CLICK_AREAS 
                    });
                    updateStatus('Timeout failsafe: Scroll to bottom completed.', 'info');
                    console.log('DEBUG: Timeout failsafe: Scroll to bottom completed.');
                }
                
                return 'timeout';
            }
            
            // Check custom triggers during the build process (do this every cycle, independent of build actions)
            // Get the ACTUAL effective direction being used (not the saved preference)
            // finishLevel passes getEffectiveDirection, main passes getEffectiveDirectionForLevel
            const currentDirection = (dependencies.getEffectiveDirection ? dependencies.getEffectiveDirection() : null) 
                || (dependencies.getEffectiveDirectionForLevel ? dependencies.getEffectiveDirectionForLevel() : null)
                || levelSettings.scrollDirection 
                || 'up';
            console.log(`DEBUG: Checking custom triggers during build #${buildNumber} at ${elapsedTime}ms (effective direction: ${currentDirection})`);
            const triggerResult = await checkCustomTriggersDuringBuild(settingsLevelName, buildNumber, elapsedTime, currentDirection, buildName, dependencies);
            // If a clickaround trigger fired, exit immediately (blue build box disappears)
            // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
            if (triggerResult === 'custom_trigger_clickaround_completed') {
                console.log('DEBUG: Custom trigger clickaround executed - blue box disappeared, exiting runBuildProtocol immediately');
                return triggerResult;
            }
            // If activeSkill trigger fired, exit immediately (blue build box disappears)
            // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
            if (triggerResult === 'custom_trigger_activeskill_completed') {
                console.log('DEBUG: Custom trigger activeSkill executed - blue box disappeared, exiting runBuildProtocol immediately');
                return triggerResult;
            }
            // If any custom trigger fired, invalidate cached red blob coords
            if (triggerResult) {
                cachedRedBlobCoords = null;
                console.log('DEBUG: [PREDICTIVE] Cache invalidated due to custom trigger firing');
            }
            
            // Only check for action if one is configured and hasn't been executed yet
            // If triggerTimeMs is null, execute immediately; otherwise wait for the trigger time
            if (!actionAlreadyExecuted && currentBuildAction.action !== 'nothing' && (actionTriggerTime === null || elapsedTime >= actionTriggerTime)) {
                // Mark as executed globally (persists across build interruptions)
                console.log(`DEBUG: About to mark build action as executed - Level: "${currentLevelName}", Build: ${buildNumber}`);
                if (dependencies.markBuildActionAsExecuted) {
                    dependencies.markBuildActionAsExecuted(currentLevelName, buildNumber);
                } else {
                    console.warn('WARNING: markBuildActionAsExecuted function not available in dependencies!');
                }
                
                if (actionTriggerTime === null) {
                    updateStatus(`Finish Build routine: Executing ${currentBuildAction.action} action immediately`, 'warn');
                    console.log(`DEBUG: Finish Build routine: Executing ${currentBuildAction.action} action immediately`);
                } else {
                    const intervalMinutes = actionTriggerTime / (60 * 1000);
                    updateStatus(`Finish Build routine: Executing ${currentBuildAction.action} action after ${intervalMinutes} minute(s)`, 'warn');
                    console.log(`DEBUG: Finish Build routine: Executing ${currentBuildAction.action} action after ${intervalMinutes} minute(s)`);
                }
                
                // Execute the action based on type
                if (currentBuildAction.action === 'clickaround') {
                    // Get clickaround options from settings (with defaults)
                    const clickaroundOptions = currentBuildAction.clickaroundOptions || {
                        excludeRedBlobs: true,
                        clickaroundChunks: 3,
                        scrollUpDistance: 200,
                        scrollUpCount: 5,
                        initialScrollDown: 150,
                        scrollToBottomAtEnd: true
                    };
                    
                    console.log('DEBUG: Finish Build: Using clickaround options:', clickaroundOptions);
                    
                    // Call clickAround with the configured options
                    const clickAroundDependencies = {
                        updateStatus: dependencies.updateStatus,
                        detectRedBlobs: dependencies.redBlobDetectorDetect,
                        performClick: dependencies.performClick,
                        performBatchedClicks: dependencies.performBatchedClicks || (async (clickArray) => {
                            console.warn('WARNING: Using performBatchedClicks FALLBACK - this will be much slower!');
                            updateStatus('WARNING: Using slow fallback for batch clicks!', 'warn');
                            if (!Array.isArray(clickArray)) return { success: false, error: 'Invalid click array' };
                            for (const click of clickArray) {
                                await dependencies.performClick(click.x, click.y);
                            }
                            return { success: true };
                        }),
                        iphoneMirroringRegion: dependencies.iphoneMirroringRegion,
                        updateCurrentFunction: dependencies.updateCurrentFunction,
                        CLICK_AREAS: dependencies.CLICK_AREAS,
                        captureScreenRegion: dependencies.captureScreenRegion,
                        sendDetectionResults: (detections) => {
                            if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
                                dependencies.mainWindow.webContents.send('detection-results', detections);
                            }
                        },
                        getIsClickAroundRunning: () => true,
                        getIsClickAroundPaused: () => false,
                        scrollToBottom: dependencies.scrollToBottom,
                        scrollSwipeDistance: dependencies.scrollSwipeDistance,
                        scrollToBottomIterations: dependencies.scrollToBottomIterations,
                        compareBottomRegions: dependencies.compareBottomRegions,
                        captureBottomRegion: dependencies.captureBottomRegion,
                    };
                    
                    const { clickAround } = require('./clickAround');
                    // Pass options as third parameter (second param maintained for backward compatibility)
                    await clickAround(clickAroundDependencies, true, clickaroundOptions);
                    
                    // Invalidate cached red blob coords after clickaround
                    cachedRedBlobCoords = null;
                    console.log('DEBUG: [PREDICTIVE] Cache invalidated due to build action (clickaround)');
                    
                    updateStatus('Finish Build: Action completed. Returning control to Finish Level.', 'success');
                    console.log('DEBUG: Finish Build: Action completed. Returning control to Finish Level.');
                    return 'clickaround_completed';
                } else if (currentBuildAction.action === 'click_off') {
                    // Perform click off action
                    if (dependencies.performClick && dependencies.CLICK_AREAS.CLICK_OFF) {
                        await dependencies.performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                        updateStatus('Finish Build: Click off completed.', 'success');
                        return 'click_off_completed';
                    }
                } else if (currentBuildAction.action === 'click_off_and_scroll') {
                    // Perform click off and scroll in explicit direction
                    if (dependencies.performClick && dependencies.CLICK_AREAS.CLICK_OFF) {
                        // Click off
                        await dependencies.performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                        
                        // Get scroll settings (explicit direction now)
                        const scrollDirection = currentBuildAction.clickOffAndScrollDirection || 'down';
                        const scrollDistance = currentBuildAction.clickOffAndScrollDistance || 150;
                        
                        const scrollX = dependencies.iphoneMirroringRegion.x + dependencies.iphoneMirroringRegion.width / 2;
                        const scrollY = dependencies.iphoneMirroringRegion.y + dependencies.iphoneMirroringRegion.height / 2;
                        
                        console.log(`DEBUG: Click off and scroll - Direction: ${scrollDirection}, Distance: ${scrollDistance}px`);
                        
                        if (scrollDirection === 'down') {
                            const { scrollDown } = require('./scrolling');
                            await scrollDown(scrollX, scrollY, scrollDistance);
                            updateStatus(`Finish Build: Click off and scrolled down ${scrollDistance}px.`, 'success');
                        } else {
                            await dependencies.scrollUp(scrollX, scrollY, { 
                                updateCurrentFunction, 
                                CLICK_AREAS: dependencies.CLICK_AREAS, 
                                performClick: dependencies.performClick,
                                getRandomInt: dependencies.getRandomInt
                            });
                            updateStatus(`Finish Build: Click off and scrolled up.`, 'success');
                        }
                        
                        // Invalidate cached red blob coords after scrolling
                        cachedRedBlobCoords = null;
                        console.log('DEBUG: [PREDICTIVE] Cache invalidated due to build action (click_off_and_scroll)');
                        
                        return 'click_off_scroll_completed';
                    }
                } else if (currentBuildAction.action === 'scroll_to_bottom') {
                    // Invalidate cache before scroll_to_bottom action
                    cachedRedBlobCoords = null;
                    console.log('DEBUG: [PREDICTIVE] Cache invalidated due to build action (scroll_to_bottom)');
                    
                    // Scroll to bottom
                    if (scrollToBottom) {
                        const scrollX = dependencies.iphoneMirroringRegion.x + dependencies.iphoneMirroringRegion.width / 2;
                        const scrollY = dependencies.iphoneMirroringRegion.y + dependencies.iphoneMirroringRegion.height / 2;
                        await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, dependencies.scrollToBottomIterations || 10, { 
                            updateCurrentFunction, 
                            performClick: dependencies.performClick, 
                            CLICK_AREAS: dependencies.CLICK_AREAS 
                        });
                        updateStatus('Finish Build: Scroll to bottom completed.', 'success');
                        return 'scroll_to_bottom_completed';
                    }
                }
            }
            
            // Perform blue box detection once per cycle to get the latest state
            // Skip detection on first iteration if we have a confirmed box from prepBuild
            let currentDetectedBox = null;
            if (isFirstLoopIteration && confirmedBlueBuildBox) {
                console.log('DEBUG: Skipping first cycle detection - using confirmed box from prepBuild');
                currentDetectedBox = initialDetectedBox; // Use the confirmed box
                isFirstLoopIteration = false;
            } else {
                isFirstLoopIteration = false;
                currentDetectedBox = await findBlueBoxWithRetry(dependencies, blueBoxCoords);
            }

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
                
                // Mark this build as successfully completed
                if (dependencies.markBuildAsCompleted) {
                    dependencies.markBuildAsCompleted();
                }
                
                // Calculate elapsed time for this build
                const elapsedTime = Date.now() - startTime;
                
                // Get the ACTUAL effective direction being used (same logic as during-build triggers)
                const currentDirection = (dependencies.getEffectiveDirection ? dependencies.getEffectiveDirection() : null) 
                    || (dependencies.getEffectiveDirectionForLevel ? dependencies.getEffectiveDirectionForLevel() : null)
                    || levelSettings.scrollDirection 
                    || 'up';
                
                // Check for custom triggers that fire AFTER build completes
                console.log(`DEBUG: Checking AFTER-build triggers for build #${buildNumber} at ${elapsedTime}ms (effective direction: ${currentDirection})`);
                const afterTriggerResult = await checkCustomTriggersAfterBuild(settingsLevelName, buildNumber, elapsedTime, currentDirection, buildName, dependencies);
                // If a clickaround trigger fired, exit immediately (blue build box disappears)
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                if (afterTriggerResult === 'custom_trigger_clickaround_completed') {
                    console.log('DEBUG: AFTER-build custom trigger clickaround executed - blue box disappeared, exiting runBuildProtocol immediately');
                    return afterTriggerResult;
                }
                // If activeSkill trigger fired, exit immediately (blue build box disappears)
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                if (afterTriggerResult === 'custom_trigger_activeskill_completed') {
                    console.log('DEBUG: AFTER-build custom trigger activeSkill executed - blue box disappeared, exiting runBuildProtocol immediately');
                    return afterTriggerResult;
                }
                // If any AFTER-build trigger fired, invalidate cached red blob coords
                if (afterTriggerResult) {
                    cachedRedBlobCoords = null;
                    console.log('DEBUG: [PREDICTIVE] Cache invalidated due to AFTER-build trigger firing');
                }
                
                if (exitLevelDetected) {
                    updateStatus('Exit level detected during build. Exiting immediately.', 'success');
                    console.log('DEBUG: Exit level detected during build. Returning to Finish Level.');
                    return { status: 'exit_level_detected' };
                }
                
                // Check if we have cached red blob coords from predictive detection
                if (cachedRedBlobCoords) {
                    console.log(`DEBUG: [PREDICTIVE] Using cached red blob coordinates: (${cachedRedBlobCoords.x}, ${cachedRedBlobCoords.y}) - skipping click off`);
                    return { status: 'max_build_achieved', cachedRedBlobCoords }; // Return cached coords
                }
                
                // Perform the "click off" action (only if no cached coords)
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

            // Predictive red blob detection: Search for red blobs during idle time
            const now = Date.now();
            if (!exitLevelDetected && !cachedRedBlobCoords && (now - lastRedBlobDetectionTime >= RED_BLOB_DETECTION_INTERVAL)) {
                lastRedBlobDetectionTime = now;
                
                // Run red blob detection in the background (don't await, just fire and forget)
                if (dependencies.redBlobDetectorDetect && captureScreenRegion && dependencies.iphoneMirroringRegion) {
                    captureScreenRegion().then(async (screenDataUrl) => {
                        if (screenDataUrl) {
                            const redBlobs = await dependencies.redBlobDetectorDetect(screenDataUrl, dependencies.iphoneMirroringRegion);
                            if (redBlobs && redBlobs.length > 0) {
                                // Check for exit level blob first
                                const exitBlob = redBlobs.find(blob => blob.name === 'exit level');
                                if (exitBlob) {
                                    exitLevelDetected = true;
                                    cachedRedBlobCoords = null;
                                    console.log('DEBUG: [PREDICTIVE] Exit level blob detected during build.');
                                    return;
                                }

                                // Filter out named blobs (research, exit level)
                                const unnamedBlobs = redBlobs.filter(blob => !blob.name);
                                if (unnamedBlobs.length > 0) {
                                    // Cache the first unnamed blob coordinates
                                    const blob = unnamedBlobs[0];
                                    const predictiveBlobX = Math.round(blob.x + blob.width / 2);
                                    const predictiveBlobY = Math.round(blob.y + blob.height / 2);
                                    
                                    // PREDICTIVE RED BLOB RESTRICTION (can be removed if needed)
                                    // Apply spatial validation to prevent caching problematic blobs
                                    let isValidPredictiveBlob = true;
                                    if (originalRedBlobCoords) {
                                        const currentBlobX = originalRedBlobCoords.x;
                                        const currentBlobY = originalRedBlobCoords.y;
                                        
                                        // If predictive blob is higher up (lower Y) than current blob,
                                        // it MUST also be significantly to the left (X at least 150px lower)
                                        if (predictiveBlobY < currentBlobY) {
                                            if (predictiveBlobX >= currentBlobX - 150) {
                                                isValidPredictiveBlob = false;
                                                console.log(`DEBUG: [PREDICTIVE] Rejecting blob at (${predictiveBlobX}, ${predictiveBlobY}) - higher than current (${currentBlobX}, ${currentBlobY}) but not far enough left (needs X < ${currentBlobX - 150})`);
                                            }
                                        }
                                        // If predictive blob has higher Y or higher X, no restriction - accept it
                                    }
                                    
                                    if (isValidPredictiveBlob) {
                                        cachedRedBlobCoords = {
                                            x: predictiveBlobX,
                                            y: predictiveBlobY
                                        };
                                        console.log(`DEBUG: [PREDICTIVE] Cached red blob coordinates: (${cachedRedBlobCoords.x}, ${cachedRedBlobCoords.y})`);
                                    }
                                }
                            }
                        }
                    }).catch(err => {
                        console.error('DEBUG: [PREDICTIVE] Error detecting red blobs:', err);
                    });
                }
            }
            
            if (exitLevelDetected) {
                updateStatus('Exit level detected during build. Exiting immediately.', 'success');
                console.log('DEBUG: Exit level detected during build. Returning to Finish Level.');
                return { status: 'exit_level_detected' };
            }

            // Step 3: Call a function to hold down in the middle of the current blue box for duration from settings
            const holdResult = await holdBlueBox(blueBoxCoords, 5000, dependencies, settingsLevelName);

            // If hold stopped early (build completed), exit immediately without re-checking
            // We already detected grey_max during the hold callback, no need to verify again
            if (holdResult && holdResult.stoppedEarly) {
                console.log('DEBUG: Hold stopped early due to grey_max detection - EXITING IMMEDIATELY (no re-check needed)');
                
                // Mark this build as successfully completed
                if (dependencies.markBuildAsCompleted) {
                    dependencies.markBuildAsCompleted();
                }
                
                // Calculate elapsed time for this build
                const elapsedTime = Date.now() - startTime;
                
                // Get the ACTUAL effective direction being used
                const currentDirection = (dependencies.getEffectiveDirection ? dependencies.getEffectiveDirection() : null) 
                    || (dependencies.getEffectiveDirectionForLevel ? dependencies.getEffectiveDirectionForLevel() : null)
                    || levelSettings.scrollDirection 
                    || 'up';
                
                // Check for custom triggers that fire AFTER build completes
                console.log(`DEBUG: Checking AFTER-build triggers for build #${buildNumber} at ${elapsedTime}ms (effective direction: ${currentDirection})`);
                const afterTriggerResult = await checkCustomTriggersAfterBuild(settingsLevelName, buildNumber, elapsedTime, currentDirection, buildName, dependencies);
                // If a clickaround trigger fired, exit immediately (blue build box disappears)
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                if (afterTriggerResult === 'custom_trigger_clickaround_completed') {
                    console.log('DEBUG: AFTER-build custom trigger clickaround executed - blue box disappeared, exiting runBuildProtocol immediately (early hold exit)');
                    return afterTriggerResult;
                }
                // If activeSkill trigger fired, exit immediately (blue build box disappears)
                // Other triggers can still fire in subsequent builds (they're not marked as fired yet)
                if (afterTriggerResult === 'custom_trigger_activeskill_completed') {
                    console.log('DEBUG: AFTER-build custom trigger activeSkill executed - blue box disappeared, exiting runBuildProtocol immediately (early hold exit)');
                    return afterTriggerResult;
                }
                // If any AFTER-build trigger fired, invalidate cached red blob coords
                if (afterTriggerResult) {
                    cachedRedBlobCoords = null;
                    console.log('DEBUG: [PREDICTIVE] Cache invalidated due to AFTER-build trigger firing (early hold exit)');
                }
                
                if (exitLevelDetected) {
                    updateStatus('Exit level detected during build (early exit).', 'success');
                    console.log('DEBUG: Exit level detected during build (early exit).');
                    return { status: 'exit_level_detected' };
                }
                
                // Check if we have cached red blob coords from predictive detection
                if (cachedRedBlobCoords) {
                    console.log(`DEBUG: [PREDICTIVE] Using cached red blob coordinates (early exit): (${cachedRedBlobCoords.x}, ${cachedRedBlobCoords.y}) - skipping click off`);
                    return { status: 'max_build_achieved', cachedRedBlobCoords }; // Return cached coords
                }
                
                // Perform the "click off" action (only if no cached coords)
                if (dependencies.performClick && dependencies.CLICK_AREAS.CLICK_OFF) {
                    updateStatus('Performing final "click off" action.', 'info');
                    await dependencies.performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                } else {
                    console.warn('WARNING: CLICK_OFF coordinates or performClick not available in dependencies.');
                }

                return 'max_build_achieved'; // Return immediately - don't continue loop
            }

            // Step 4: Call another function to check research blob (respects level settings)
            const researchBlobFound = await checkResearchBlob(dependencies, settingsLevelName);

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

module.exports = { runBuildProtocol, resetAutomationState, findAndGetBlueBoxClickCoordinates, stopAutomation, resetCustomTriggerState, checkResearchBlob, doResearch };
