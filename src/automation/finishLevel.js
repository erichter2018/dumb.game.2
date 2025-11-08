const settingsManager = require('../../lib/settingsManager');
const levelDatabase = require('../../lib/levelDatabase');

function startAutomation(dependencies) {
    const { updateStatus, getIsAutomationRunning, detectBlueBoxes, redBlobDetectorDetect, performClick, captureScreenRegion, iphoneMirroringRegion, scrollUp, scrollDown, scrollUpWithDistance, scrollToBottom, scrollToTop, scrollSwipeDistance, scrollToBottomIterations, scrollUpAttempts, updateCurrentFunction, updatePreviousLevelDuration, getCurrentLevelStartTime, getReconnectionDowntimeMs, getRandomInt } = dependencies;

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

    let buildCompletionCount = 0; // Track how many builds have completed
    // Effective direction chosen once per level
    let currentLevelEffectiveDirection = null; // 'up' | 'down'
    let currentLevelRandomApplied = false;

    // Custom triggers tracking
    let levelStartTime = Date.now(); // Track when level started
    let triggeredActions = new Set(); // Track which triggers have already fired

    function resetEffectiveDirectionForNewLevel() {
        currentLevelEffectiveDirection = null;
        currentLevelRandomApplied = false;
    }

    // Custom trigger detection and execution
    async function checkCustomTriggers(levelName) {
        try {
            // Normalize level name to match how it's stored in settings
            const normalizedLevelName = levelName ? levelName.toLowerCase().trim() : '';
            console.log(`DEBUG: checkCustomTriggers called for level: "${levelName}" -> normalized: "${normalizedLevelName}"`);
            
            const triggers = settingsManager.getCustomTriggers(normalizedLevelName);
            console.log(`DEBUG: Found ${triggers ? triggers.length : 0} custom triggers for level "${normalizedLevelName}"`);
            
            if (!triggers || triggers.length === 0) {
                console.log(`DEBUG: No custom triggers found for level "${normalizedLevelName}"`);
                return;
            }

            const currentTime = Date.now();
            const timeSpent = currentTime - levelStartTime;
            console.log(`DEBUG: Current build count: ${buildCompletionCount}, time spent: ${timeSpent}ms`);

            for (let i = 0; i < triggers.length; i++) {
                const trigger = triggers[i];
                const triggerKey = `${trigger.triggerType}-${trigger.triggerValue}-${i}`;
                
                console.log(`DEBUG: Checking trigger ${i}: ${trigger.triggerType}:${trigger.triggerValue} -> ${trigger.action}`);
                
                // Skip if already triggered
                if (triggeredActions.has(triggerKey)) {
                    console.log(`DEBUG: Trigger ${i} already fired, skipping`);
                    continue;
                }

                let shouldTrigger = false;

                // Check trigger conditions
                if (trigger.triggerType === 'buildNumber' && buildCompletionCount >= trigger.triggerValue) {
                    shouldTrigger = true;
                    console.log(`DEBUG: Build number trigger condition met: ${buildCompletionCount} >= ${trigger.triggerValue}`);
                } else if (trigger.triggerType === 'timeSpent' && timeSpent >= trigger.triggerValue) {
                    shouldTrigger = true;
                    console.log(`DEBUG: Time spent trigger condition met: ${timeSpent}ms >= ${trigger.triggerValue}ms`);
                }

                if (shouldTrigger) {
                    console.log(`DEBUG: Custom trigger fired - ${trigger.triggerType}:${trigger.triggerValue} -> ${trigger.action}`);
                    triggeredActions.add(triggerKey);
                    await executeTriggerAction(trigger, dependencies);
                }
            }
        } catch (error) {
            console.error('Error checking custom triggers:', error);
        }
    }

    async function executeTriggerAction(trigger, dependencies) {
        const { performClick, scrollUp, scrollDown, updateStatus, updateCurrentFunction, captureScreenRegion, redBlobDetectorDetect } = dependencies;
        
        try {
            switch (trigger.action) {
                case 'clickAround':
                    updateCurrentFunction('customTrigger-clickAround');
                    updateStatus(`Custom trigger: Click Around for ${trigger.actionParams}ms`, 'info');
                    await executeClickAround(trigger.actionParams, dependencies);
                    break;
                    
                case 'scrollUp':
                    updateCurrentFunction('customTrigger-scrollUp');
                    updateStatus(`Custom trigger: Scroll Up ${trigger.actionParams}px`, 'info');
                    const scrollUpX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                    const scrollUpY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                    await scrollUpWithDistance(scrollUpX, scrollUpY, trigger.actionParams || 200);
                    break;
                    
                case 'scrollDown':
                    updateCurrentFunction('customTrigger-scrollDown');
                    updateStatus(`Custom trigger: Scroll Down ${trigger.actionParams}px`, 'info');
                    const scrollDownX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                    const scrollDownY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                    await scrollDown(scrollDownX, scrollDownY, trigger.actionParams || 200);
                    break;
                    
                default:
                    console.log(`DEBUG: Unknown trigger action: ${trigger.action}`);
            }
        } catch (error) {
            console.error('Error executing trigger action:', error);
        }
    }

    // Execute click around action
    async function executeClickAround(durationMs, dependencies) {
        const { performClick, updateStatus, updateCurrentFunction } = dependencies;
        const startTime = Date.now();
        const endTime = startTime + (durationMs || 5000);
        
        console.log(`DEBUG: Starting click around for ${durationMs}ms`);
        
        while (Date.now() < endTime && getIsAutomationRunning()) {
            // Random click within the iPhone mirroring region
            const randomX = iphoneMirroringRegion.x + Math.random() * iphoneMirroringRegion.width;
            const randomY = iphoneMirroringRegion.y + Math.random() * iphoneMirroringRegion.height;
            
            await performClick(randomX, randomY);
            
            // Small delay between clicks
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
        }
        
        console.log(`DEBUG: Click around completed`);
    }

    function selectEffectiveDirectionOnce(levelName) {
        if (currentLevelEffectiveDirection) {
            return { dir: currentLevelEffectiveDirection, randomApplied: currentLevelRandomApplied };
        }
        try {
            const mode = settingsManager.getDirectionMode ? settingsManager.getDirectionMode() : 'random';
            const savedDir = (settingsManager.getLevelSettings(levelName).scrollDirection) || 'up';
            const upS = settingsManager.getDirectionSettings(levelName, 'up');
            const downS = settingsManager.getDirectionSettings(levelName, 'down');
            
            if (mode === 'up') {
                currentLevelEffectiveDirection = 'up';
                currentLevelRandomApplied = false;
            } else if (mode === 'random') {
                if (upS.optimized === true && downS.optimized === true) {
                    currentLevelEffectiveDirection = Math.random() < 0.5 ? 'up' : 'down';
                    currentLevelRandomApplied = true;
                } else {
                    currentLevelEffectiveDirection = savedDir;
                    currentLevelRandomApplied = false;
                }
            } else if (mode === 'best') {
                // For Unknown Level or empty level name, just use saved direction (defaults to 'up')
                if (!levelName || levelName.toLowerCase() === 'unknown level' || levelName.trim() === '') {
                    currentLevelEffectiveDirection = savedDir;
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Best mode - Unknown Level, using saved direction '${savedDir}'`);
                } else {
                    // Determine best direction based on historical data
                    const historicalStats = require('../../lib/historicalStats');
                    const bestTimes = historicalStats.getLevelBest(levelName);
                    const avgTimes = historicalStats.getLevelAverageByDirection(levelName);
                    
                    console.log(`DEBUG: Best mode - bestTimes:`, bestTimes, `avgTimes:`, avgTimes);
                
                // Check optimization status
                const upOptimized = upS.optimized === true;
                const downOptimized = downS.optimized === true;
                
                // If only one direction is optimized, always use that
                if (upOptimized && !downOptimized) {
                    currentLevelEffectiveDirection = 'up';
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Best mode - choosing 'up' (only up is optimized)`);
                } else if (downOptimized && !upOptimized) {
                    currentLevelEffectiveDirection = 'down';
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Best mode - choosing 'down' (only down is optimized)`);
                } else if (bestTimes.up && bestTimes.down) {
                    // Both have data, compare best times
                    const diff = Math.abs(bestTimes.up - bestTimes.down);
                    const maxTime = Math.max(bestTimes.up, bestTimes.down);
                    const percentDiff = (diff / maxTime) * 100;
                    
                    if (percentDiff <= 1) {
                        // Within 1%, use average instead
                        console.log(`DEBUG: Best mode - best times within 1% (${percentDiff.toFixed(2)}%), using average`);
                        if (avgTimes.up && avgTimes.down) {
                            currentLevelEffectiveDirection = avgTimes.up < avgTimes.down ? 'up' : 'down';
                        } else if (avgTimes.up) {
                            currentLevelEffectiveDirection = 'up';
                        } else if (avgTimes.down) {
                            currentLevelEffectiveDirection = 'down';
                        } else {
                            currentLevelEffectiveDirection = bestTimes.up < bestTimes.down ? 'up' : 'down';
                        }
                    } else {
                        // Use best time
                        currentLevelEffectiveDirection = bestTimes.up < bestTimes.down ? 'up' : 'down';
                    }
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Best mode - choosing '${currentLevelEffectiveDirection}' (up: ${bestTimes.up}ms, down: ${bestTimes.down}ms)`);
                } else if (bestTimes.up) {
                    currentLevelEffectiveDirection = 'up';
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Best mode - choosing 'up' (only up has data)`);
                } else if (bestTimes.down) {
                    currentLevelEffectiveDirection = 'down';
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Best mode - choosing 'down' (only down has data)`);
                } else {
                    // No data, use saved
                    currentLevelEffectiveDirection = savedDir;
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Best mode - no data, using saved direction '${savedDir}'`);
                }
                }
            } else if (mode === 'worst') {
                // For Unknown Level or empty level name, just use saved direction (defaults to 'up')
                if (!levelName || levelName.toLowerCase() === 'unknown level' || levelName.trim() === '') {
                    currentLevelEffectiveDirection = savedDir;
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Worst mode - Unknown Level, using saved direction '${savedDir}'`);
                } else {
                    // Determine worst direction based on historical data
                    const historicalStats = require('../../lib/historicalStats');
                    const bestTimes = historicalStats.getLevelBest(levelName);
                    const avgTimes = historicalStats.getLevelAverageByDirection(levelName);
                    
                    console.log(`DEBUG: Worst mode - bestTimes:`, bestTimes, `avgTimes:`, avgTimes);
                
                // Check optimization status
                const upOptimized = upS.optimized === true;
                const downOptimized = downS.optimized === true;
                
                // ALWAYS choose non-optimized direction if one exists
                if (!upOptimized && downOptimized) {
                    currentLevelEffectiveDirection = 'up';
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Worst mode - choosing 'up' (not optimized)`);
                } else if (!downOptimized && upOptimized) {
                    currentLevelEffectiveDirection = 'down';
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Worst mode - choosing 'down' (not optimized)`);
                } else if (bestTimes.up && bestTimes.down) {
                    // Both have same optimization status, compare times
                    const diff = Math.abs(bestTimes.up - bestTimes.down);
                    const maxTime = Math.max(bestTimes.up, bestTimes.down);
                    const percentDiff = (diff / maxTime) * 100;
                    
                    if (percentDiff <= 1) {
                        // Within 1%, use average instead
                        console.log(`DEBUG: Worst mode - best times within 1% (${percentDiff.toFixed(2)}%), using average`);
                        if (avgTimes.up && avgTimes.down) {
                            currentLevelEffectiveDirection = avgTimes.up > avgTimes.down ? 'up' : 'down';
                        } else if (avgTimes.up) {
                            currentLevelEffectiveDirection = 'up';
                        } else if (avgTimes.down) {
                            currentLevelEffectiveDirection = 'down';
                        } else {
                            currentLevelEffectiveDirection = bestTimes.up > bestTimes.down ? 'up' : 'down';
                        }
                    } else {
                        // Use worst (slower) time
                        currentLevelEffectiveDirection = bestTimes.up > bestTimes.down ? 'up' : 'down';
                    }
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Worst mode - choosing '${currentLevelEffectiveDirection}' (up: ${bestTimes.up}ms, down: ${bestTimes.down}ms)`);
                } else if (bestTimes.up && !bestTimes.down) {
                    // For worst mode: no data is worse than any data
                    currentLevelEffectiveDirection = 'down';
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Worst mode - choosing 'down' (no data, worse than up which has data)`);
                } else if (bestTimes.down && !bestTimes.up) {
                    // For worst mode: no data is worse than any data
                    currentLevelEffectiveDirection = 'up';
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Worst mode - choosing 'up' (no data, worse than down which has data)`);
                } else {
                    // No data, use saved
                    currentLevelEffectiveDirection = savedDir;
                    currentLevelRandomApplied = false;
                    console.log(`DEBUG: Worst mode - no data, using saved direction '${savedDir}'`);
                }
                }
            } else {
                currentLevelEffectiveDirection = savedDir; // 'saved'
                currentLevelRandomApplied = false;
            }
        } catch (e) {
            console.error(`DEBUG: Error in selectEffectiveDirectionOnce:`, e);
            currentLevelEffectiveDirection = 'up';
            currentLevelRandomApplied = false;
        }
        return { dir: currentLevelEffectiveDirection, randomApplied: currentLevelRandomApplied };
    }
    const MAX_RED_BLOB_CLICK_ATTEMPTS = 6; // Define max retry attempts for red blob clicks
    const MAX_BLUE_BOX_CONFIRM_ATTEMPTS = 1; // Testing: 1 attempt only with 50ms delay
    const BLUE_BOX_DETECTION_DELAY_MS = 50; // Old: 300ms | New: 50ms - Faster polling
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

                // Add delay before re-detection to ensure blue build has time to disappear if unstable
                await new Promise(resolve => setTimeout(resolve, BLUE_BOX_DETECTION_DELAY_MS));

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
                    await new Promise(resolve => setTimeout(resolve, BLUE_BOX_DETECTION_DELAY_MS)); // Delay before next retry
                }
            } else {
                updateStatus('No blue build box detected. Retrying...', 'warn');
                console.log('DEBUG: No blue build box detected. Retrying...');
                await new Promise(resolve => setTimeout(resolve, BLUE_BOX_DETECTION_DELAY_MS)); // Delay before next retry
            }
        }
        return confirmedBlueBuildBox;
    }

    async function prepBuild(redBlobCoords) {
        updateCurrentFunction('prepBuild'); // Update current function display
        updateStatus('Executing prepBuild function...', 'info');
        console.log('DEBUG: Executing prepBuild function...', 'info');
        if (!getIsAutomationRunning()) return 'stopped';

        // Add delay before detection to ensure blue build has time to appear
        await new Promise(resolve => setTimeout(resolve, BLUE_BOX_DETECTION_DELAY_MS));
        let blueBuildBoxConfirmed = await confirmAndClickBlueBuildBox(dependencies); // Try to confirm and click blue box first
        if (!getIsAutomationRunning()) return 'stopped';

        if (blueBuildBoxConfirmed) {
            updateStatus('Blue build box confirmed. Launching Finish Build automation.', 'info');
            console.log('DEBUG: Blue build box confirmed. Launching Finish Build.');
            // Set internal flag before launching finishBuildAutomation
            isFinishBuildRunningInternal = true;
            // Get effective direction for this level
            const settingsLevelName = dependencies.getLevelNameForSettings ? dependencies.getLevelNameForSettings() : currentLevelName;
            const eff = selectEffectiveDirectionOnce(settingsLevelName);
            
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
                confirmedBlueBuildBox: blueBuildBoxConfirmed, // Pass the confirmed blue box to skip re-detection
                getEffectiveDirection: () => eff.dir, // Pass effective direction to build protocol
            };
            // Launch finishBuild automation
            const buildResult = await dependencies.finishBuildAutomationRunBuildProtocol(finishBuildDependencies); // Pass custom dependencies
            // Reset internal flag after finishBuildAutomation returns
            isFinishBuildRunningInternal = false;
            if (!getIsAutomationRunning()) return 'stopped';
            
            // Extract cached red blob coords if returned (predictive detection)
            let cachedRedBlobCoords = null;
            let buildStatus = buildResult;
            if (typeof buildResult === 'object' && buildResult.cachedRedBlobCoords) {
                cachedRedBlobCoords = buildResult.cachedRedBlobCoords;
                buildStatus = buildResult.status;
                console.log(`DEBUG: [PREDICTIVE] Received cached red blob coords from finishBuild: (${cachedRedBlobCoords.x}, ${cachedRedBlobCoords.y})`);
            }

            // Check if we should scroll to bottom after build completion based on settings
            if (buildStatus === 'exit_level_detected') {
                updateStatus('Exit level detected during build. Initiating exit.', 'success');
                console.log('DEBUG: Exit level detected during build. Calling exitAndStartNewLevel.');
                await exitAndStartNewLevel(dependencies);
                if (!getIsAutomationRunning()) return 'stopped';
                nextBuildCachedRedBlobCoords = null;
                return 'exit_level_detected';
            }

            if (buildStatus !== 'stopped' && buildStatus !== 'error' && buildStatus !== 'max_build_at_startup') {
                buildCompletionCount++;
                console.log(`DEBUG: Build ${buildCompletionCount} completed with status: ${buildResult}`);
                
                // Get current level name to check settings
                const currentLevelName = dependencies.getCurrentLevelName ? dependencies.getCurrentLevelName() : '';
                const settingsLevelName = dependencies.getLevelNameForSettings ? dependencies.getLevelNameForSettings() : currentLevelName;
                
                // Send build completion signal (first_build or second_build)
                const buildNumber = buildCompletionCount === 1 ? 'first_build' : 'second_build';
                if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
                    console.log(`🔨 Sending ${buildNumber} signal (build completed)`);
                    dependencies.mainWindow.webContents.send('level-action-completed', buildNumber);
                }
                // Use the once-selected effective direction for this level
                const eff = selectEffectiveDirectionOnce(settingsLevelName);
                const levelSettings = (() => {
                    const global = settingsManager.getLevelSettings(settingsLevelName);
                    const dirSettings = settingsManager.getDirectionSettings(settingsLevelName, eff.dir);
                    console.log(`DEBUG: After build ${buildCompletionCount} - Level: "${settingsLevelName}", Direction: ${eff.dir}`);
                    console.log(`DEBUG: dirSettings:`, JSON.stringify(dirSettings, null, 2));
                    return {
                        ...dirSettings,
                        doResearch: global.doResearch,
                        blueBoxClickHoldDuration: global.blueBoxClickHoldDuration,
                        maxBuildTimeMs: global.maxBuildTimeMs,
                        scrollDirection: eff.dir
                    };
                })();
                const scrollDirection = levelSettings.scrollDirection || 'up';
                // Do not emit effective-direction here; it's sent at level start
                
                // Check scroll action after build (new explicit direction system)
                // Only apply scroll settings for builds 1 and 2
                let scrollSetting = { action: 'nothing' };
                if (buildCompletionCount === 1) {
                    scrollSetting = levelSettings.scrollAfterFirstBuild || { action: 'nothing' };
                } else if (buildCompletionCount === 2) {
                    scrollSetting = levelSettings.scrollAfterSecondBuild || { action: 'nothing' };
                }
                // For build 3+, scrollSetting stays as { action: 'nothing' }
                
                console.log(`DEBUG: scrollAfterFirstBuild:`, JSON.stringify(levelSettings.scrollAfterFirstBuild));
                console.log(`DEBUG: scrollAfterSecondBuild:`, JSON.stringify(levelSettings.scrollAfterSecondBuild));
                console.log(`DEBUG: scrollSetting for build ${buildCompletionCount}:`, JSON.stringify(scrollSetting));
                
                if (scrollSetting.action !== 'nothing') {
                    // Invalidate cached red blob coords if we're about to scroll
                    if (cachedRedBlobCoords) {
                        console.log('DEBUG: [PREDICTIVE] Cache invalidated due to after-build scroll action');
                        cachedRedBlobCoords = null;
                    }
                    
                    const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                    const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                    
                    console.log(`DEBUG: Scroll after build ${buildCompletionCount}: ${scrollSetting.action} (direction: ${scrollSetting.direction || 'N/A'}, distance: ${scrollSetting.distance || 'N/A'})`);
                    
                    if (scrollSetting.action === 'scrollToBottom') {
                        await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                    } else if (scrollSetting.action === 'scrollToTop') {
                        await scrollToTop({ updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS, iphoneMirroringRegion });
                    } else if (scrollSetting.action === 'scrollCustom') {
                        const distance = scrollSetting.distance || 300;
                        if (scrollSetting.direction === 'up') {
                            await scrollUpWithDistance(scrollX, scrollY, distance);
                            console.log(`DEBUG: Scrolled UP ${distance}px after build ${buildCompletionCount}`);
                        } else {
                            await scrollDown(scrollX, scrollY, distance);
                            console.log(`DEBUG: Scrolled DOWN ${distance}px after build ${buildCompletionCount}`);
                        }
                    }
                    if (!getIsAutomationRunning()) return 'stopped';
                }
                
                // Mark the "after build" action as complete (always, even if no scroll)
                const afterBuildAction = buildCompletionCount === 1 ? 'after_first_build' : 'after_second_build';
                if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
                    console.log(`🎯 Sending ${afterBuildAction} action completed signal`);
                    dependencies.mainWindow.webContents.send('level-action-completed', afterBuildAction);
                } else {
                    console.log(`⚠️ Cannot send ${afterBuildAction} signal - mainWindow not available`);
                }
            }

            if (buildStatus === 'max_build_achieved' || buildStatus === 'max_build_at_startup') {
                updateStatus('Finish Build reported MAX build. Exiting prepBuild.', 'success');
                console.log('DEBUG: Finish Build reported MAX build. Exiting prepBuild.');
                
                // Return cached coords if available (from predictive detection)
                if (cachedRedBlobCoords) {
                    return { status: buildStatus, cachedRedBlobCoords }; // Pass cached coords up to finishLevel
                }
                return buildStatus; // Exit prepBuild but let Finish Level loop continue
            } else if (buildStatus === 'no_blue_box_found') { // This status isn't returned by finishBuild currently, but was discussed.
                updateStatus('Finish Build failed to find blue box. Exiting prepBuild to allow red blob detection.', 'warn');
                console.log('DEBUG: Finish Build reported no blue box found. Exiting prepBuild.');
                return 'finish_build_failed_no_blue_box'; // New return status
            } else if (buildStatus === 'timeout') { // New: Handle timeout from finishBuildAutomationRunBuildProtocol
                updateStatus('Finish Build timed out. Exiting prepBuild.', 'warn');
                console.log('DEBUG: Finish Build timed out. Exiting prepBuild.');
                return 'finish_build_timed_out'; // New return status for timeout
            } else if (buildStatus === 'clickaround_completed') { // New: Handle clickaround completion
                updateStatus('Finish Build completed Click Around and returned control. Exiting prepBuild.', 'success');
                console.log('DEBUG: Finish Build completed Click Around and returned control. Exiting prepBuild.');
                return 'finish_build_clickaround_completed'; // New return status for clickaround completion
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
        const clickY = redBlobCoords.y + Math.floor(redBlobCoords.height * 1.9);

        let blueBuildBoxAfterClicks = null;

        for (let i = 0; i < MAX_RED_BLOB_CLICK_ATTEMPTS; i++) {
            if (!getIsAutomationRunning()) return 'stopped';

            // Log before click attempt
            console.log(`DEBUG: Initiating red blob click attempt ${i+1}/${MAX_RED_BLOB_CLICK_ATTEMPTS}.`);

            // Single click on all attempts
            console.log(`DEBUG: Single clicking red blob (attempt ${i+1}) at X:${Math.round(clickX)}, Y:${Math.round(clickY)}.`);
            await performClick(Math.round(clickX), Math.round(clickY));
            if (!getIsAutomationRunning()) return 'stopped';
            console.log(`DEBUG: Single click performed. Waiting ${BLUE_BOX_DETECTION_DELAY_MS}ms.`);
            await new Promise(resolve => setTimeout(resolve, BLUE_BOX_DETECTION_DELAY_MS)); // Delay after click for blue build stabilization
            // Log after click attempt
            console.log(`DEBUG: Red blob click attempt ${i+1} completed. Checking for blue box.`);

            // After clicking the red blob, try to confirm and click the blue build box
            let currentConfirmedBlueBox = await confirmAndClickBlueBuildBox(dependencies);
            if (!getIsAutomationRunning()) return 'stopped';

            if (currentConfirmedBlueBox) {
                blueBuildBoxAfterClicks = currentConfirmedBlueBox;
                
                // Verification step: Click off, then try clicking 1.5x to the right of red blob center
                // COMMENTED OUT - verification process removed
                /*
                updateStatus('Verifying red blob click accuracy with alternative position...', 'info');
                console.log('DEBUG: Blue box confirmed, now verifying click accuracy.');
                
                // Click off to reset
                await performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Calculate verification click: 1.5x to the right of red blob center, same vertical level
                const verificationClickX = redBlobCoords.x + Math.floor(redBlobCoords.width * 1.5);
                const verificationClickY = redBlobCoords.y + Math.floor(redBlobCoords.height / 2);
                
                updateStatus(`Verification click at X:${verificationClickX}, Y:${verificationClickY}`, 'info');
                console.log(`DEBUG: Verification click at X:${verificationClickX}, Y:${verificationClickY}`);
                await performClick(verificationClickX, verificationClickY);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Check if verification click also produces blue build
                const verificationBlueBox = await confirmAndClickBlueBuildBox(dependencies);
                if (!getIsAutomationRunning()) return 'stopped';
                
                if (verificationBlueBox) {
                    updateStatus('Verification successful - alternative click position also works.', 'success');
                    console.log('DEBUG: Verification successful - alternative click position also works.');
                    // Use the verification blue box instead
                    blueBuildBoxAfterClicks = verificationBlueBox;
                } else {
                    updateStatus('Verification failed - reverting to original 1.5x both directions click.', 'warn');
                    console.log('DEBUG: Verification failed - reverting to original 1.5x both directions click.');
                    
                    // Click off again and go back to original 1.5x both directions
                    await performClick(dependencies.CLICK_AREAS.CLICK_OFF.x, dependencies.CLICK_AREAS.CLICK_OFF.y);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    const revertClickX = redBlobCoords.x + Math.floor(redBlobCoords.width * 1.5);
                    const revertClickY = redBlobCoords.y + Math.floor(redBlobCoords.height * 1.5);
                    
                    updateStatus(`Reverting to original click at X:${revertClickX}, Y:${revertClickY}`, 'info');
                    console.log(`DEBUG: Reverting to original click at X:${revertClickX}, Y:${revertClickY}`);
                    await performClick(revertClickX, revertClickY);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Confirm the reverted click works
                    const revertedBlueBox = await confirmAndClickBlueBuildBox(dependencies);
                    if (!getIsAutomationRunning()) return 'stopped';
                    
                    if (revertedBlueBox) {
                        blueBuildBoxAfterClicks = revertedBlueBox;
                    } else {
                        updateStatus('Error: Both original and reverted clicks failed. Continuing with first successful click.', 'error');
                        console.error('ERROR: Both original and reverted clicks failed. Continuing with first successful click.');
                    }
                }
                */
                
                break; // Blue box confirmed, exit red blob retry loop
            }
        }

        if (blueBuildBoxAfterClicks) {
            updateStatus('Blue build found after clicking red blob. Launching Finish Build automation.', 'info');
            console.log('DEBUG: Blue build found after clicking red blob. Launching Finish Build.');
            // Set internal flag before launching finishBuildAutomation
            isFinishBuildRunningInternal = true;
            // Get effective direction for this level (reuse the same direction as first build)
            const settingsLevelName = dependencies.getLevelNameForSettings ? dependencies.getLevelNameForSettings() : currentLevelName;
            const eff = selectEffectiveDirectionOnce(settingsLevelName);
            
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
                confirmedBlueBuildBox: blueBuildBoxAfterClicks, // Pass the confirmed blue box to skip re-detection
                getEffectiveDirection: () => eff.dir, // Pass effective direction to build protocol
            };
            const buildResult = await dependencies.finishBuildAutomationRunBuildProtocol(finishBuildDependencies); // Corrected dependency call
            // Reset internal flag after finishBuildAutomation returns
            isFinishBuildRunningInternal = false;
            if (!getIsAutomationRunning()) return 'stopped';

            // Check if we should scroll to bottom after build completion based on settings
            if (buildResult !== 'stopped' && buildResult !== 'error') {
                buildCompletionCount++;
                console.log(`DEBUG: Build ${buildCompletionCount} completed with status: ${buildResult} after red blob click`);
                
                // Get current level name to check settings
                const currentLevelName = dependencies.getCurrentLevelName ? dependencies.getCurrentLevelName() : '';
                const settingsLevelName = dependencies.getLevelNameForSettings ? dependencies.getLevelNameForSettings() : currentLevelName;
                
                // Send build completion signal (first_build or second_build)
                const buildNumber = buildCompletionCount === 1 ? 'first_build' : 'second_build';
                if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
                    console.log(`🔨 Sending ${buildNumber} signal (build completed)`);
                    dependencies.mainWindow.webContents.send('level-action-completed', buildNumber);
                }
                const resolveDirectionMode = () => {
                    const mode = settingsManager.getDirectionMode ? settingsManager.getDirectionMode() : 'random';
                    const savedDir = (settingsManager.getLevelSettings(settingsLevelName).scrollDirection) || 'up';
                    if (mode === 'up') return { dir: 'up', mode, randomApplied: false };
                    if (mode === 'random') {
                        const upS = settingsManager.getDirectionSettings(settingsLevelName, 'up');
                        const downS = settingsManager.getDirectionSettings(settingsLevelName, 'down');
                        if (upS.optimized === true && downS.optimized === true) {
                            const dir = Math.random() < 0.5 ? 'up' : 'down';
                            return { dir, mode, randomApplied: true };
                        }
                        return { dir: savedDir, mode, randomApplied: false };
                    }
                    return { dir: savedDir, mode: 'saved', randomApplied: false };
                };
                // Use the once-selected effective direction for the rest of the level
                const eff2 = { dir: currentLevelEffectiveDirection || 'up', randomApplied: currentLevelRandomApplied, mode: (settingsManager.getDirectionMode ? settingsManager.getDirectionMode() : 'random') };
                const levelSettings = (() => {
                    const global = settingsManager.getLevelSettings(settingsLevelName);
                    const dirSettings = settingsManager.getDirectionSettings(settingsLevelName, eff2.dir);
                    return {
                        ...dirSettings,
                        doResearch: global.doResearch,
                        blueBoxClickHoldDuration: global.blueBoxClickHoldDuration,
                        maxBuildTimeMs: global.maxBuildTimeMs,
                        scrollDirection: eff2.dir
                    };
                })();
                const scrollDirection = levelSettings.scrollDirection || 'up';
                if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
                    dependencies.mainWindow.webContents.send('effective-direction', eff2.mode, eff2.dir, eff2.randomApplied);
                }
                if (dependencies.setEffectiveDirectionInfo) {
                    dependencies.setEffectiveDirectionInfo(eff2);
                }
                
                // Check scroll action after build (new explicit direction system)
                let scrollSetting = { action: 'nothing' };
                if (buildCompletionCount === 1) {
                    scrollSetting = levelSettings.scrollAfterFirstBuild || { action: 'nothing' };
                } else if (buildCompletionCount === 2) {
                    scrollSetting = levelSettings.scrollAfterSecondBuild || { action: 'nothing' };
                }
                // For builds 3+, scrollSetting remains { action: 'nothing' }
                
                if (scrollSetting.action !== 'nothing') {
                    const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                    const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                    
                    console.log(`DEBUG: Scroll after build ${buildCompletionCount}: ${scrollSetting.action} (direction: ${scrollSetting.direction || 'N/A'}, distance: ${scrollSetting.distance || 'N/A'})`);
                    
                    if (scrollSetting.action === 'scrollToBottom') {
                        await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                    } else if (scrollSetting.action === 'scrollToTop') {
                        await scrollToTop({ updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS, iphoneMirroringRegion });
                    } else if (scrollSetting.action === 'scrollCustom') {
                        const distance = scrollSetting.distance || 300;
                        if (scrollSetting.direction === 'up') {
                            await scrollUpWithDistance(scrollX, scrollY, distance);
                            console.log(`DEBUG: Scrolled UP ${distance}px after build ${buildCompletionCount}`);
                        } else {
                            await scrollDown(scrollX, scrollY, distance);
                            console.log(`DEBUG: Scrolled DOWN ${distance}px after build ${buildCompletionCount}`);
                        }
                    }
                    if (!getIsAutomationRunning()) return 'stopped';
                }
                
                // Mark the "after build" action as complete (always, even if no scroll)
                const afterBuildAction = buildCompletionCount === 1 ? 'after_first_build' : 'after_second_build';
                if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
                    console.log(`🎯 Sending ${afterBuildAction} action completed signal`);
                    dependencies.mainWindow.webContents.send('level-action-completed', afterBuildAction);
                } else {
                    console.log(`⚠️ Cannot send ${afterBuildAction} signal - mainWindow not available`);
                }
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

    async function exitAndStartNewLevel(exitDependencies) {
        const { performClick, updateStatus, CLICK_AREAS, getIsAutomationRunning, updateCurrentFunction, updatePreviousLevelDuration, getCurrentLevelStartTime, getReconnectionDowntimeMs, resetClickAroundCallCounter, captureLevelName, updateCurrentLevelName, setFinishedLevelName, captureScreenRegion, scrollDown, scrollToBottom, scrollSwipeDistance, scrollToBottomIterations, getCurrentLevelName, getBuildNumberForCurrentLevel, saveMinimumBuildCount } = exitDependencies;

        // Store the current level name as the finished level name
        const currentLevel = getCurrentLevelName();
        setFinishedLevelName(currentLevel);
        console.log(`DEBUG: Stored finished level name: "${currentLevel}"`);
        
        // Save the minimum build count for this level
        // getBuildNumberForCurrentLevel returns the NEXT build number, so current completed builds = that - 1
        const totalBuilds = getBuildNumberForCurrentLevel() - 1;
        if (totalBuilds > 0) {
            saveMinimumBuildCount(currentLevel, totalBuilds);
        }

        // Note: Don't clear level name here - let it update naturally when OCR detects the new level
        // This prevents the UI from briefly showing "Unknown Level" during the transition

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
        console.log(`DEBUG: Finished click at "Confirm Exit" at (${CLICK_AREAS.CONFIRM_EXIT.x}, ${CLICK_AREAS.CONFIRM_EXIT.y}). Waiting 5,000ms.`);

        // Wait 5,000ms (reduced from 7,500ms)
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (!getIsAutomationRunning()) { return; }

        // New level starting: reset effective direction cache
        resetEffectiveDirectionForNewLevel();

        // Capture level name using OCR with retry until valid - validate against levelDatabase
        console.log('DEBUG: Starting OCR retry loop to capture valid level name...');
        updateStatus('Capturing level name...', 'info');
        let validLevelName = null;
        let retryCount = 0;
        const maxRetries = 30; // Safety limit to prevent infinite loop
        
        while (!validLevelName && retryCount < maxRetries && getIsAutomationRunning()) {
            retryCount++;
            console.log(`DEBUG: OCR attempt ${retryCount}/${maxRetries}...`);
            
            try {
                const levelName = await dependencies.captureLevelName(dependencies.captureScreenRegion);
                
                if (levelName && levelName !== 'Unknown Level') {
                    // First try exact match
                    let levelPosition = levelDatabase.getLevelPosition(levelName);
                    let matchedName = levelName;
                    
                    // If no exact match, try to find a valid level/stage name within the text
                    if (!levelPosition) {
                        console.log(`DEBUG: No exact match for "${levelName}", checking individual words and phrases...`);
                        const words = levelName.split(/\s+/);
                        
                        // First check for multi-word stage names (like "Cape Town", "New York", "San Francisco")
                        for (let i = 0; i < words.length - 1; i++) {
                            const twoWordPhrase = `${words[i]} ${words[i + 1]}`;
                            if (twoWordPhrase.length >= 6) {
                                const stageInfo = levelDatabase.getStageByCity(twoWordPhrase);
                                if (stageInfo) {
                                    const firstLevel = stageInfo.levels[0];
                                    levelPosition = {
                                        stageName: twoWordPhrase,
                                        stageNumber: stageInfo.stageNumber,
                                        position: 1,
                                        levelInfo: firstLevel
                                    };
                                    // IMPORTANT: Use the CITY NAME, not "Level 1"
                                    // main.js needs the city name to detect stage transitions
                                    matchedName = twoWordPhrase;
                                    console.log(`DEBUG: Found valid two-word stage name "${twoWordPhrase}" within OCR result "${levelName}" - will pass city name to trigger stage detection`);
                                    break;
                                }
                            }
                        }
                        
                        // Then check individual words if no multi-word match found
                        if (!levelPosition) {
                            for (const word of words) {
                                if (word.length >= 3) {
                                    // Check if it's a level name
                                    const wordPosition = levelDatabase.getLevelPosition(word);
                                    if (wordPosition) {
                                        levelPosition = wordPosition;
                                        matchedName = word;
                                        console.log(`DEBUG: Found valid level name "${word}" within OCR result "${levelName}"`);
                                        break;
                                    }
                                    
                                    // Also check if it's a single-word stage name (city)
                                    const stageInfo = levelDatabase.getStageByCity(word);
                                    if (stageInfo) {
                                        const firstLevel = stageInfo.levels[0];
                                        levelPosition = {
                                            stageName: word,
                                            stageNumber: stageInfo.stageNumber,
                                            position: 1,
                                            levelInfo: firstLevel
                                        };
                                        // IMPORTANT: Use the CITY NAME, not "Level 1"
                                        // main.js needs the city name to detect stage transitions
                                        matchedName = word;
                                        console.log(`DEBUG: Found valid single-word stage name "${word}" within OCR result "${levelName}" - will pass city name to trigger stage detection`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    if (levelPosition) {
                        // Valid level found!
                        validLevelName = matchedName;
                        console.log(`DEBUG: Valid level name captured on attempt ${retryCount}: "${matchedName}" (Stage: ${levelPosition.stageName}, Position: ${levelPosition.position})`);
                        dependencies.updateCurrentLevelName(matchedName);
                        updateStatus(`Level name captured: "${matchedName}"`, 'success');
                    } else {
                        console.log(`DEBUG: OCR returned "${levelName}" but no valid level name found - retrying...`);
                        // Wait 250ms before retry
                        await new Promise(resolve => setTimeout(resolve, 250));
                    }
                } else {
                    console.log(`DEBUG: OCR returned empty or "Unknown Level" - retrying...`);
                    // Wait 250ms before retry
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
            } catch (error) {
                console.error(`ERROR: Level name OCR attempt ${retryCount} failed:`, error);
                // Wait 250ms before retry
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }
        
        if (!validLevelName) {
            console.log(`DEBUG: Failed to capture valid level name after ${retryCount} attempts - keeping previous level name`);
            updateStatus('Level name capture failed after retries - keeping previous name', 'warn');
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
        
        // Level-specific scrolling actions based on settings
        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
        
        // Get the current level name to determine scrolling action
        const currentLevelName = getCurrentLevelName ? getCurrentLevelName() : 'Unknown Level';
        console.log(`DEBUG: Current level name for scrolling decision: "${currentLevelName}"`);
        
        // Determine effective direction ONCE per level
        const settingsLevelName = dependencies.getLevelNameForSettings ? dependencies.getLevelNameForSettings() : currentLevelName;
        const eff = selectEffectiveDirectionOnce(settingsLevelName);
        
        // Store the effective direction for later use in stage tracking
        if (dependencies.setCurrentEffectiveDirection) {
            dependencies.setCurrentEffectiveDirection(eff.dir);
        }
        // Build effective level settings for chosen direction
        const effSettings = (() => {
            const global = settingsManager.getLevelSettings(settingsLevelName);
            const dirSettings = settingsManager.getDirectionSettings(settingsLevelName, eff.dir);
            return {
                ...dirSettings,
                doResearch: global.doResearch,
                blueBoxClickHoldDuration: global.blueBoxClickHoldDuration,
                maxBuildTimeMs: global.maxBuildTimeMs,
                scrollDirection: eff.dir
            };
        })();
        // Inform UI of effective direction
        if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
            const mode = settingsManager.getDirectionMode ? settingsManager.getDirectionMode() : 'random';
            console.log(`DEBUG: Sending effective-direction to UI: mode=${mode}, dir=${eff.dir}, randomApplied=${eff.randomApplied}`);
            dependencies.mainWindow.webContents.send('effective-direction', mode, eff.dir, eff.randomApplied);
        } else {
            console.log(`DEBUG: Cannot send effective-direction - mainWindow not available`);
        }
        
        // Handle perfectStartingPosition (can be string or object for backward compatibility)
        let perfectStartingPositionAction, perfectStartingPositionWaitTime;
        if (typeof effSettings.perfectStartingPosition === 'object') {
            perfectStartingPositionAction = effSettings.perfectStartingPosition.action || 'nothing';
            perfectStartingPositionWaitTime = effSettings.perfectStartingPosition.waitTimeMs || null;
        } else {
            perfectStartingPositionAction = effSettings.perfectStartingPosition || 'nothing';
            perfectStartingPositionWaitTime = null;
        }
        
        const scrollDirection = effSettings.scrollDirection || 'up';
        
        console.log(`DEBUG: Perfect starting position for "${settingsLevelName}": ${perfectStartingPositionAction} (scroll direction: ${scrollDirection})`);
        
        // Notify that startup action is complete (always mark it, even if "nothing")
        if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
            console.log('🚀 Sending startup action completed signal');
            console.log('🚀 MainWindow state:', {
                isDestroyed: dependencies.mainWindow.isDestroyed(),
                webContents: !!dependencies.mainWindow.webContents,
                isReady: dependencies.mainWindow.webContents && !dependencies.mainWindow.webContents.isDestroyed()
            });
            
            // Try sending with a delay to ensure renderer is ready
            setTimeout(() => {
                if (dependencies.mainWindow && !dependencies.mainWindow.isDestroyed()) {
                    console.log('🚀 Delayed send - attempting to send events');
                    dependencies.mainWindow.webContents.send('test-event', 'startup-test-delayed');
                    dependencies.mainWindow.webContents.send('level-action-completed', 'startup');
                }
            }, 1000);
            
            dependencies.mainWindow.webContents.send('test-event', 'startup-test');
            dependencies.mainWindow.webContents.send('level-action-completed', 'startup');
        } else {
            console.log('⚠️ Cannot send startup signal - mainWindow not available');
        }
        
        if (perfectStartingPositionAction === 'wait') {
            const waitTime = perfectStartingPositionWaitTime || 1000;
            console.log(`DEBUG: Level "${currentLevelName}" requires wait: ${waitTime}ms`);
            updateStatus(`Level-specific action: ${currentLevelName} - waiting ${waitTime}ms.`, 'info');
            await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (perfectStartingPositionAction === 'scroll_up_1x') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll UP once.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling UP once.`, 'info');
            await scrollUpWithDistance(scrollX, scrollY, scrollSwipeDistance);
            await new Promise(resolve => setTimeout(resolve, 100));
        } else if (perfectStartingPositionAction === 'scroll_up_2x') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll UP twice.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling UP twice.`, 'info');
            for (let i = 0; i < 2; i++) {
                if (!getIsAutomationRunning()) { return; }
                await scrollUpWithDistance(scrollX, scrollY, scrollSwipeDistance);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else if (perfectStartingPositionAction === 'scroll_up_3x') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll UP three times.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling UP three times.`, 'info');
            for (let i = 0; i < 3; i++) {
                if (!getIsAutomationRunning()) { return; }
                await scrollUpWithDistance(scrollX, scrollY, scrollSwipeDistance);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else if (perfectStartingPositionAction === 'scroll_down_1x') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll DOWN once.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling DOWN once.`, 'info');
            await scrollDown(scrollX, scrollY, scrollSwipeDistance);
            await new Promise(resolve => setTimeout(resolve, 100));
        } else if (perfectStartingPositionAction === 'scroll_down_2x') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll DOWN twice.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling DOWN twice.`, 'info');
            for (let i = 0; i < 2; i++) {
                if (!getIsAutomationRunning()) { return; }
                await scrollDown(scrollX, scrollY, scrollSwipeDistance);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else if (perfectStartingPositionAction === 'scroll_down_3x') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll DOWN three times.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling DOWN three times.`, 'info');
            for (let i = 0; i < 3; i++) {
                if (!getIsAutomationRunning()) { return; }
                await scrollDown(scrollX, scrollY, scrollSwipeDistance);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else if (perfectStartingPositionAction === 'scroll_down_4x') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll DOWN four times.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling DOWN four times.`, 'info');
            for (let i = 0; i < 4; i++) {
                if (!getIsAutomationRunning()) { return; }
                await scrollDown(scrollX, scrollY, scrollSwipeDistance);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else if (perfectStartingPositionAction === 'scroll_to_bottom') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll to BOTTOM.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling to bottom.`, 'info');
            await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
        } else if (perfectStartingPositionAction === 'scroll_to_top') {
            console.log(`DEBUG: Level "${currentLevelName}" requires scroll to TOP.`);
            updateStatus(`Level-specific scrolling: ${currentLevelName} - scrolling to top.`, 'info');
            await scrollToTop({ updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS, iphoneMirroringRegion });
        } else {
            // No specific action needed for this level
            console.log(`DEBUG: No specific scrolling action needed for level "${currentLevelName}".`);
            updateStatus(`No level-specific scrolling needed for: ${currentLevelName}`, 'info');
        }
        
        if (!getIsAutomationRunning()) { return; }

        // After a successful exit and new level start, update the previous level duration
        // Subtract reconnection downtime to compensate for connection interruptions
        const rawDuration = Date.now() - getCurrentLevelStartTime();
        const compensatedDuration = rawDuration - getReconnectionDowntimeMs();
        const downtimeSeconds = (getReconnectionDowntimeMs() / 1000).toFixed(1);
        if (getReconnectionDowntimeMs() > 0) {
            console.log(`LEVEL COMPLETE: Raw duration: ${(rawDuration / 1000).toFixed(1)}s, Downtime: ${downtimeSeconds}s, Compensated: ${(compensatedDuration / 1000).toFixed(1)}s`);
        }
        updatePreviousLevelDuration(compensatedDuration);
        
        // Reset the build completion count for the new level
        buildCompletionCount = 0;
        redBlobRetryCount.clear(); // Reset retry counters for new level
        
        // Reset custom trigger tracking for new level
        levelStartTime = Date.now();
        triggeredActions.clear();
        
        console.log('DEBUG: Reset buildCompletionCount to 0 for new level.');
        
        // Final 2-second wait before exiting function
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!getIsAutomationRunning()) { return; }
    }

    let scrollUpCount = 0; // Counter for consecutive scroll-up attempts
    let detectionAttemptCount = 0; // Counter for detection attempts within current scroll position
    let redBlobRetryCount = new Map(); // Track retry attempts per red blob location (key: "x,y", value: count)
    const MAX_RED_BLOB_RETRIES = 3; // Maximum retries for the same red blob location before triggering scroll-to-bottom

    async function runFinishLevelProtocol() {
        updateCurrentFunction('runFinishLevelProtocol'); // Update current function display
        
        // Get current level name once for the entire function
        const currentLevelName = dependencies.getCurrentLevelName ? dependencies.getCurrentLevelName() : '';
        const settingsLevelName = dependencies.getLevelNameForSettings ? dependencies.getLevelNameForSettings() : currentLevelName;
        
        // Predictive red blob detection: track cached coords across loop iterations
        let nextBuildCachedRedBlobCoords = null;
        
        while (getIsAutomationRunning()) {
            // Check time-based custom triggers periodically
            if (settingsLevelName && settingsLevelName !== 'Unknown Level' && settingsLevelName !== '') {
                await checkCustomTriggers(settingsLevelName);
            }
            
            // Check connection health before each iteration
            if (dependencies.checkConnectionHealth && !dependencies.checkConnectionHealth()) {
                console.warn('CONNECTION HEALTH CHECK FAILED: Triggering reconnection');
                updateStatus('Connection may be lost. Attempting reconnection...', 'error');
                
                // Attempt reconnection
                if (dependencies.attemptReconnection) {
                    const reconnected = await dependencies.attemptReconnection(iphoneMirroringRegion);
                    
                    if (reconnected) {
                        console.log('RECONNECTION: Successful! Restarting finish level protocol');
                        updateStatus('Reconnection successful. Restarting level...', 'success');
                        
                        // Reset state and restart the level
                        redBlobsTried.clear();
                        lastRedBlobCoords = null;
                        buildCompletionCount = 0;
                        scrollUpCount = 0;
                        detectionAttemptCount = 0;
                        redBlobRetryCount.clear();
                        
                        // Continue the loop - this effectively restarts finishLevel
                        continue;
                    } else {
                        console.error('RECONNECTION FAILED: Could not re-establish connection');
                        updateStatus('Reconnection failed. Stopping automation.', 'error');
                        break;
                    }
                }
            }
            
            // Get scroll direction using the once-selected effective direction for this level
            const eff = selectEffectiveDirectionOnce(settingsLevelName);
            const scrollDirection = eff.dir;
            console.log(`DEBUG: runFinishLevelProtocol - Level "${settingsLevelName}" scroll direction: ${scrollDirection}`);
            
            let blueBuildBox = null;
            
            // Only detect blue builds if we haven't completed a build yet
            if (buildCompletionCount === 0) {
                updateStatus('Checking for blue build box...', 'info');
                const fullScreenDataUrl = await captureScreenRegion();
                const blueBoxes = await detectBlueBoxes(fullScreenDataUrl, iphoneMirroringRegion);
                blueBuildBox = blueBoxes.find(box => box.state === 'blue_build' || box.state === 'grey_build'); // Exclude 'unknown' from initial decision
            } else {
                updateStatus(`Build completed ${buildCompletionCount} time(s), skipping blue build detection. Checking for red blobs...`, 'info');
                console.log(`DEBUG: buildCompletionCount is ${buildCompletionCount}, skipping blue build detection and going directly to red blob detection.`);
            }

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

                // Extract cached coords from prepBuild result (if any)
                if (typeof result === 'object' && result.cachedRedBlobCoords) {
                    nextBuildCachedRedBlobCoords = result.cachedRedBlobCoords;
                    console.log(`DEBUG: [PREDICTIVE] Saved cached coords for next build: (${nextBuildCachedRedBlobCoords.x}, ${nextBuildCachedRedBlobCoords.y})`);
                }
                
                const prepBuildStatus = typeof result === 'object' ? result.status : result;
                
                if (prepBuildStatus === 'max_build_achieved') {
                    updateStatus('Finish Build reported MAX build. Finish Level continuing loop.', 'success');
                    console.log('DEBUG: Finish Build reported MAX build. Finish Level continuing loop.');
                    // Do not break; continue the loop
                } else if (prepBuildStatus === 'finish_build_launched') {
                    updateStatus('Finish Build automation successfully launched from prepBuild.', 'info');
                    console.log('DEBUG: Finish Build automation successfully launched.');
                } else if (prepBuildStatus === 'no_blue_build') {
                    // This case should ideally not happen if blueBuildBox was found, but for robustness
                    updateStatus('PrepBuild returned no_blue_build even though blue box was initially found. Continuing.', 'warn');
                    console.log('DEBUG: PrepBuild returned no_blue_build unexpectedly. Continuing.');
                } else if (prepBuildStatus === 'error') {
                    updateStatus('PrepBuild encountered an error. Stopping Finish Level.', 'error');
                    console.error('ERROR: PrepBuild returned an error state. Stopping Finish Level.');
                    break; // Stop the loop on error
                } else if (prepBuildStatus === 'stopped') {
                    updateStatus('Finish Level automation stopped during prepBuild.', 'info');
                    console.log('DEBUG: Finish Level automation stopped during prepBuild.');
                    break; // Exit the loop if automation was stopped
                } else if (prepBuildStatus === 'no_build_box_exceeded_retries') { // New: Handle finish build exiting due to no build box
                    updateStatus('Finish Build exited due to consecutive failures. Continuing Finish Level.', 'warn');
                    console.log('DEBUG: Finish Build exited due to consecutive failures. Continuing Finish Level.');
                    redBlobsTried.add(JSON.stringify(targetBlob)); // Mark current red blob as tried
                    lastRedBlobCoords = null; // Clear last red blob coords to avoid immediately retrying it
                } else if (prepBuildStatus === 'timeout') { // New: Handle finish build timeout
                    updateStatus('Finish Build timed out. Continuing Finish Level.', 'warn');
                    console.log('DEBUG: Finish Build timed out. Continuing Finish Level.');
                    redBlobsTried.add(JSON.stringify(targetBlob)); // Mark current red blob as tried
                    lastRedBlobCoords = null; // Clear last red blob coords
                }
            } else {
                // Either no blue build box found (first time) or we're skipping blue detection (buildCompletionCount > 0)
                if (buildCompletionCount === 0) {
                    updateStatus('No blue build box found. Detecting red blobs...', 'info');
                    console.log('DEBUG: No blue build box found. Detecting red blobs.');
                }
                
                // Check if we have cached red blob coords from previous build (predictive detection)
                if (nextBuildCachedRedBlobCoords) {
                    console.log(`DEBUG: [PREDICTIVE] Using cached red blob coords from previous build: (${nextBuildCachedRedBlobCoords.x}, ${nextBuildCachedRedBlobCoords.y}) - skipping red blob detection`);
                    updateStatus('Using predictively detected red blob - clicking directly...', 'info');
                    
                    // Use cached coords directly
                    const clickX = nextBuildCachedRedBlobCoords.x + 25;
                    const clickY = nextBuildCachedRedBlobCoords.y + 25;
                    await performClick(Math.round(clickX), Math.round(clickY));
                    
                    // Clear the cache after use
                    const cachedCoords = nextBuildCachedRedBlobCoords;
                    nextBuildCachedRedBlobCoords = null;
                    
                    if (!getIsAutomationRunning()) break;
                    const prepBuildResult = await prepBuild(cachedCoords);
                    if (!getIsAutomationRunning()) break;
                    
                    // Extract new cached coords if any
                    if (typeof prepBuildResult === 'object' && prepBuildResult.cachedRedBlobCoords) {
                        nextBuildCachedRedBlobCoords = prepBuildResult.cachedRedBlobCoords;
                        console.log(`DEBUG: [PREDICTIVE] Saved new cached coords for next build: (${nextBuildCachedRedBlobCoords.x}, ${nextBuildCachedRedBlobCoords.y})`);
                    }
                    
                    // Continue the loop
                    continue;
                }
                
                // Capture screen for red blob detection
                const fullScreenDataUrl = await captureScreenRegion();
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
                        
                        console.log(`DEBUG: Second detection also found no actionable blobs. Proceeding to scroll.`);
                        console.log(`DEBUG: No red blobs or blue boxes found after ${detectionAttemptCount} attempts (including second detection). Scrolling ${scrollDirection}.`);
                        updateStatus(`No objects found after ${detectionAttemptCount} attempts (including second detection). Scrolling ${scrollDirection}...`, 'warn');
                        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                        
                        // Scroll in the appropriate direction based on settings
                        if (scrollDirection === 'down') {
                            await scrollDown(scrollX, scrollY, 250); // 250px for red blob search
                        } else {
                            await scrollUp(scrollX, scrollY, { updateCurrentFunction, CLICK_AREAS: dependencies.CLICK_AREAS, performClick, getRandomInt });
                        }
                        scrollUpCount++;
                        console.log(`DEBUG: Scroll count incremented to ${scrollUpCount}, limit is ${scrollUpAttempts}.`);
                        detectionAttemptCount = 0; // Reset attempt count after scrolling

                        if (scrollUpCount >= scrollUpAttempts) {
                            console.log(`DEBUG: Scrolled ${scrollDirection} ${scrollUpCount} times (reached limit). Scrolling to ${scrollDirection === 'down' ? 'top then bottom' : 'bottom'} and restarting search.`);
                            updateStatus(`Scrolled ${scrollDirection} ${scrollUpCount} times (reached limit). Resetting position and restarting search...`, 'warn');
                            if (scrollDirection === 'down') {
                                // For scroll down mode: scroll to bottom, then to top (end at top ready to scroll down)
                                await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                                await scrollToTop({ 
                                    updateCurrentFunction, 
                                    performClick, 
                                    CLICK_AREAS: dependencies.CLICK_AREAS,
                                    iphoneMirroringRegion: iphoneMirroringRegion 
                                });
                            } else {
                                // For scroll up mode: scroll to bottom (end at bottom ready to scroll up)
                                await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                            }
                            scrollUpCount = 0; // Reset scroll count
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
                                    
                                    console.log(`DEBUG: Second detection also found no new actionable blobs. Proceeding to scroll.`);
                                    console.log(`DEBUG: No usable red blobs found after ${detectionAttemptCount} attempts (including second detection). Scrolling ${scrollDirection}.`);
                                    updateStatus(`No usable objects found after ${detectionAttemptCount} attempts (including second detection). Scrolling ${scrollDirection}...`, 'warn');
                                    const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                                    const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                                    
                                    // Scroll in the appropriate direction based on settings
                                    if (scrollDirection === 'down') {
                                        await scrollDown(scrollX, scrollY, 250); // 250px for red blob search
                                    } else {
                                        await scrollUp(scrollX, scrollY, { updateCurrentFunction, CLICK_AREAS: dependencies.CLICK_AREAS, performClick, getRandomInt });
                                    }
                                    scrollUpCount++;
                                    console.log(`DEBUG: Scroll count incremented to ${scrollUpCount}, limit is ${scrollUpAttempts}.`);
                                    detectionAttemptCount = 0; // Reset attempt count after scrolling

                                    if (scrollUpCount >= scrollUpAttempts) {
                                        console.log(`DEBUG: Scrolled ${scrollDirection} ${scrollUpCount} times (reached limit). Resetting position and restarting search.`);
                                        updateStatus(`Scrolled ${scrollDirection} ${scrollUpCount} times (reached limit). Resetting position and restarting search...`, 'warn');
                                        if (scrollDirection === 'down') {
                                            // For scroll down mode: scroll to top, then to bottom
                                            await scrollToTop({ 
                                                updateCurrentFunction, 
                                                performClick, 
                                                CLICK_AREAS: dependencies.CLICK_AREAS,
                                                iphoneMirroringRegion: iphoneMirroringRegion 
                                            });
                                            await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                                        } else {
                                            // For scroll up mode: scroll to bottom
                                            await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                                        }
                                        scrollUpCount = 0; // Reset scroll count
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
                            
                            if (scrollDirection === 'down') {
                                // For scroll down mode: select top-left blob (lowest Y, then lowest X)
                                const lowestY = untriedRedBlobs.reduce((minY, blob) => Math.min(minY, blob.y), Infinity);
                                
                                // Filter for blobs within 5 pixels of the lowest Y-coordinate
                                const topRedBlobs = untriedRedBlobs.filter(blob => Math.abs(blob.y - lowestY) <= 5);
                                
                                // From these, select the one with the lowest X-coordinate
                                targetBlob = topRedBlobs.reduce((prev, current) =>
                                    (prev.x < current.x) ? prev : current
                                );
                                updateStatus('No last clicked red blob or not found, selecting lowest Y-axis (and then lowest X-axis) untried red blob (scroll down mode).', 'info');
                                console.log('DEBUG: No last clicked red blob or not found, selecting lowest Y-axis (and then lowest X-axis) untried red blob (scroll down mode):', JSON.stringify(omitImageFromLog(targetBlob)));
                            } else {
                                // For scroll up mode (default): select bottom-right blob (highest Y, then highest X)
                                const highestY = untriedRedBlobs.reduce((maxY, blob) => Math.max(maxY, blob.y), -Infinity);

                                // Filter for blobs within 5 pixels of the highest Y-coordinate
                                const bottomRedBlobs = untriedRedBlobs.filter(blob => Math.abs(blob.y - highestY) <= 5);

                                // From these, select the one with the highest X-coordinate
                                targetBlob = bottomRedBlobs.reduce((prev, current) =>
                                    (prev.x > current.x) ? prev : current
                                );
                                updateStatus('No last clicked red blob or not found, selecting highest Y-axis (and then highest X-axis) untried red blob (scroll up mode).', 'info');
                                console.log('DEBUG: No last clicked red blob or not found, selecting highest Y-axis (and then highest X-axis) untried red blob (scroll up mode):', JSON.stringify(omitImageFromLog(targetBlob)));
                            }
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
                        
                        // Extract cached coords from prepBuildResult (if any)
                        if (typeof prepBuildResult === 'object' && prepBuildResult.cachedRedBlobCoords) {
                            nextBuildCachedRedBlobCoords = prepBuildResult.cachedRedBlobCoords;
                            console.log(`DEBUG: [PREDICTIVE] Saved cached coords for next build (red blob path): (${nextBuildCachedRedBlobCoords.x}, ${nextBuildCachedRedBlobCoords.y})`);
                        }
                        
                        const prepBuildResultStatus = typeof prepBuildResult === 'object' ? prepBuildResult.status : prepBuildResult;

                        if (prepBuildResultStatus === 'exit_level_detected') {
                            updateStatus('Exit level detected during build. Initiating exit.', 'success');
                            console.log('DEBUG: Exit level detected during build (red blob path). Calling exitAndStartNewLevel.');
                            await exitAndStartNewLevel(dependencies);
                            if (!getIsAutomationRunning()) break;
                            nextBuildCachedRedBlobCoords = null;
                            updateCurrentFunction('runFinishLevelProtocol');
                            continue;
                        } else if (prepBuildResultStatus === 'max_build_achieved') {
                            updateStatus('Finish Build reported MAX build. Continuing Finish Level loop.', 'info');
                            console.log('DEBUG: prepBuild reported MAX build, continuing Finish Level loop.');
                            // Continue the loop, allowing Finish Level to re-evaluate for blue/red blobs
                            continue;
                        } else if (prepBuildResultStatus === 'error' || prepBuildResultStatus === 'stopped') {
                            updateStatus('PrepBuild encountered an error or was stopped. Stopping Finish Level.', 'error');
                            console.error('ERROR: PrepBuild returned an error or stopped state. Stopping Finish Level.');
                            break; // Stop the loop on error
                        } else if (prepBuildResultStatus === 'finish_build_launched') {
                            redBlobsTried.clear(); // Reset tried blobs if finishBuild was launched successfully
                            redBlobRetryCount.clear(); // Reset retry counters on successful finishBuild launch
                            lastRedBlobCoords = targetBlob; // Store the last successfully clicked red blob
                            updateStatus('Finish Build automation successfully launched from prepBuild after red blob click.', 'info');
                            console.log('DEBUG: Finish Build automation successfully launched after red blob click.');
                        } else if (prepBuildResultStatus === 'no_blue_build' || prepBuildResultStatus === 'no_red_blobs_found' || prepBuildResultStatus === 'finish_build_failed_no_blue_box') {
                            // Track retry attempts for this red blob location (approximate matching within 10 pixels)
                            const blobLocationKey = `${Math.round(targetBlob.x / 10) * 10},${Math.round(targetBlob.y / 10) * 10}`;
                            const currentRetries = redBlobRetryCount.get(blobLocationKey) || 0;
                            const newRetryCount = currentRetries + 1;
                            redBlobRetryCount.set(blobLocationKey, newRetryCount);
                            
                            console.log(`DEBUG: Red blob at approximate location ${blobLocationKey} failed prepBuild. Retry count: ${newRetryCount}/${MAX_RED_BLOB_RETRIES}`);
                            
                            // Check if we've exceeded the retry limit for this location
                            if (newRetryCount >= MAX_RED_BLOB_RETRIES) {
                                const resetPosition = scrollDirection === 'down' ? 'top' : 'bottom';
                                console.log(`DEBUG: Red blob location ${blobLocationKey} has failed ${newRetryCount} times. Triggering scroll-to-${resetPosition} reset.`);
                                updateStatus(`Red blob failed ${newRetryCount} times. Scrolling to ${resetPosition} to reset...`, 'warn');
                                
                                // Clear retry counters and perform scroll reset
                                redBlobRetryCount.clear();
                                redBlobsTried.clear();
                                lastRedBlobCoords = null;
                                
                                const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                                const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                                
                                // For scroll down mode: reset to top. For scroll up mode: reset to bottom
                                if (scrollDirection === 'down') {
                                    await scrollToTop({ 
                                        updateCurrentFunction, 
                                        performClick, 
                                        CLICK_AREAS: dependencies.CLICK_AREAS,
                                        iphoneMirroringRegion: iphoneMirroringRegion 
                                    });
                                } else {
                                    await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                                }
                                
                                // Reset counters
                                scrollUpCount = 0;
                                detectionAttemptCount = 0;
                                
                                console.log(`DEBUG: Scroll-to-${resetPosition} reset completed due to red blob retry limit exceeded.`);
                                continue; // Continue to restart detection from the appropriate position
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
                        console.log(`DEBUG: No red blobs found after ${detectionAttemptCount} attempts. Checking if we should scroll.`);
                        
                        // Scroll in the appropriate direction
                        updateStatus(`No objects found after ${detectionAttemptCount} attempts. Scrolling ${scrollDirection}...`, 'warn');
                        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
                        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
                        
                        // Scroll in the appropriate direction based on settings
                        if (scrollDirection === 'down') {
                            await scrollDown(scrollX, scrollY, 250); // 250px for red blob search
                        } else {
                            await scrollUp(scrollX, scrollY, { updateCurrentFunction, CLICK_AREAS: dependencies.CLICK_AREAS, performClick, getRandomInt });
                        }
                        scrollUpCount++;
                        detectionAttemptCount = 0; // Reset attempt count after scrolling
                        
                        // Check if we've reached the scroll limit
                        if (scrollUpCount >= scrollUpAttempts) {
                            console.log(`DEBUG: Reached scroll limit (${scrollUpAttempts}). Resetting position and restarting search.`);
                            updateStatus(`Scrolled ${scrollDirection} ${scrollUpCount} times (reached limit). Resetting position and restarting search...`, 'warn');
                            
                            if (scrollDirection === 'down') {
                                // For scroll down mode: scroll to bottom, then to top (end at top ready to scroll down)
                                await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                                await scrollToTop({ 
                                    updateCurrentFunction, 
                                    performClick, 
                                    CLICK_AREAS: dependencies.CLICK_AREAS,
                                    iphoneMirroringRegion: iphoneMirroringRegion 
                                });
                            } else {
                                // For scroll up mode: scroll to top, then to bottom (end at bottom ready to scroll up)
                                await scrollToTop({ 
                                    updateCurrentFunction, 
                                    performClick, 
                                    CLICK_AREAS: dependencies.CLICK_AREAS,
                                    iphoneMirroringRegion: iphoneMirroringRegion 
                                });
                                await scrollToBottom(scrollX, scrollY, scrollSwipeDistance, scrollToBottomIterations, { updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
                            }
                            scrollUpCount = 0; // Reset scroll count
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
