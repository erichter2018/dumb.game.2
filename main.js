const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const sharp = require('sharp'); // Import sharp
const robot = require('robotjs'); // Import robotjs

// Import detector modules
const redBlobDetector = require('./src/detection/redBlobDetector');
const blueBoxDetector = require('./src/detection/blueBoxDetector');
const redBlobDetectorCutoff = require('./src/detection/redBlobDetectorCutoff');
const finishBuildAutomation = require('./src/automation/finishBuild');
const finishLevelAutomation = require('./src/automation/finishLevel');
const imageComparison = require('./utils/image-comparison');
const scrollingFunctions = require('./src/automation/scrolling');
const clickAroundFunctions = require('./src/automation/clickAround');
const ocrUtils = require('./utils/ocr');
const statistics = require('./lib/statistics');
const historicalStats = require('./lib/historicalStats');
const dailyStats = require('./lib/dailyStats');
const levelDatabase = require('./lib/levelDatabase');
const settingsManager = require('./lib/settingsManager');

let mainWindow;
let isCapturing = false;
let captureInterval;
let lastBlueBoxClickCoords = null; // Store last detected blue box click coordinates
let pauseTimeout = null;
const STATUS_MESSAGE_LIMIT = 5; // Limit to 5 status messages
let statusMessageHistory = []; // Store recent status messages
let isHoldingBlueBox = false; // Add state to track if a blue box is being held
let isAutomationRunning = false; // New flag to control the automation loop in finishBuild.js
let isFinishLevelRunning = false; // For Finish Level automation
let isClickAroundRunning = false; // For Click Around automation
let isClickAroundPaused = false; // For pausing Click Around on mouse movement
let clickAroundCallCounter = 0; // Global counter for clickAround calls since level start
let lastRedBlobDetectionTime = Date.now(); // Track last time a red blob was detected
let lastBlueBuildDetectionTime = Date.now(); // Track last time a blue build was detected
let isReconnecting = false; // Flag to prevent multiple reconnection attempts
let reconnectionDowntimeMs = 0; // Track accumulated downtime from reconnections for current level
let reconnectionStartTime = null; // Track when reconnection started
let currentLevelStartTime = null; // New: To track the start time of the current level
let currentLevelName = 'Unknown Level'; // New: To track the current level name
let finishedLevelName = ''; // New: Track the name of the level that just finished
let currentEffectiveDirection = null; // New: Track the effective direction for the current level
let levelDirections = new Map(); // Store direction used for each level
let levelBuildCounts = new Map(); // Track build count per level (levelName -> buildCount)
let previousLevelDurationMs = null; // New: To store the duration of the previous level
let longestLevelDurationMs = null; // New: To store the longest level duration
let shortestLevelDurationMs = null; // New: To store the shortest level duration
let levelsFinishedCount = 0; // New: To track the number of levels finished
let totalLevelsDurationMs = 0; // New: To accumulate total duration for average calculation
let longestLevels = []; // New: Array to store top 3 longest levels with names

// Stage tracking variables
let currentStage = null; // Current stage info: { name, startTime, levels: [], id: timestamp }
let previousStage = null; // Previous completed stage
let stageTrackingEnabled = false; // Only start tracking when a fresh stage begins
let currentStageLevel = 0; // Current level within the stage (1-6 or 1-7 depending on stage)
let longestStages = []; // Array to store longest stages
let shortestStages = []; // Array to store shortest stages
let completedStagesCount = 0; // Count of completed stages
let totalStagesDurationMs = 0;

// Level mapping management
let levelToStageId = new Map(); // Map level names to stage IDs
let pendingLevelMappings = new Map(); // Map for levels that might complete late
let stageTransitionTime = null; // Track when stage transition occurred
let cleanupInterval = null; // Interval for cleaning up pending mappings

// Window state management
const windowStateFile = path.join(__dirname, 'data', 'window-state.json');

function saveWindowState() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const bounds = mainWindow.getBounds();
        const windowState = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized: mainWindow.isMaximized()
        };
        
        try {
            fs.writeFileSync(windowStateFile, JSON.stringify(windowState, null, 2));
        } catch (error) {
            console.log('Failed to save window state:', error);
        }
    }
}

function loadWindowState() {
    try {
        if (fs.existsSync(windowStateFile)) {
            const data = fs.readFileSync(windowStateFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('Failed to load window state:', error);
    }
    return null;
}

// Function to send current active function to renderer
function updateCurrentFunction(functionName) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-current-function', functionName);
    }
}

// Functions for clickAround counter management
function getClickAroundCallCounter() {
    return clickAroundCallCounter;
}

function incrementClickAroundCallCounter() {
    clickAroundCallCounter++;
    console.log(`DEBUG: ClickAround call counter incremented to: ${clickAroundCallCounter}`);
    return clickAroundCallCounter;
}

function resetClickAroundCallCounter() {
    console.log(`DEBUG: ClickAround call counter reset from ${clickAroundCallCounter} to 0`);
    clickAroundCallCounter = 0;
}

// Functions for level name management
function getCurrentLevelName() {
    return currentLevelName;
}

function updateCurrentLevelName(levelName) {
    const originalLevelName = levelName || 'Unknown Level';
    
    // Skip processing for temporary "Unknown Level" or empty names during level transitions
    if (originalLevelName === 'Unknown Level' || originalLevelName === 'Unnamed Level' || originalLevelName === '') {
        currentLevelName = originalLevelName;
        console.log(`DEBUG: Temporary level name: "${currentLevelName}" - skipping stage processing`);
        
        // Still send to renderer for UI update, but use the finished level's average if available
        if (mainWindow && !mainWindow.isDestroyed()) {
            // For temporary states, show the average of the last completed level instead of the temporary name
            const levelForAverage = finishedLevelName && finishedLevelName !== 'Unknown Level' && finishedLevelName !== '' 
                ? finishedLevelName 
                : currentLevelName;
            const levelAverage = historicalStats.getLevelAverage(levelForAverage);
            const levelAverageObj = historicalStats.getLevelAverageByDirection(levelForAverage);
            const levelBestObj = historicalStats.getLevelBest(levelForAverage);
            const levelLastObj = historicalStats.getLevelLast(levelForAverage);
            // Extract averages for up and down
            const levelAvgUp = levelAverageObj ? levelAverageObj.up : null;
            const levelAvgDown = levelAverageObj ? levelAverageObj.down : null;
            // Extract best times for up and down
            const levelBestUp = levelBestObj ? levelBestObj.up : null;
            const levelBestDown = levelBestObj ? levelBestObj.down : null;
            // Extract last times for up and down
            const levelLastUp = levelLastObj ? levelLastObj.up : null;
            const levelLastDown = levelLastObj ? levelLastObj.down : null;
            console.log(`DEBUG: Sending level data for "${levelForAverage}": avgUp=${levelAvgUp}, avgDown=${levelAvgDown}, bestUp=${levelBestUp}, bestDown=${levelBestDown}, lastUp=${levelLastUp}, lastDown=${levelLastDown}`);
            mainWindow.webContents.send('update-current-level-name', currentLevelName, levelAverage, levelAvgUp, levelAvgDown, levelBestUp, levelBestDown, levelLastUp, levelLastDown);
        }
        return;
    }
    
    // Don't auto-store level names here - let the exit process handle it
    
    // Check if this level starts a new stage
    if (statistics.isStageStart(originalLevelName)) {
        const stageCityName = statistics.getStageCity(originalLevelName);
        console.log(`DEBUG: New stage detected: "${stageCityName}"`);
        
        // Start new stage (this will complete the current stage if one exists)
        startNewStage(stageCityName);
        
        // Look up the proper first level name from the database using 'originalName'
        const stageInfo = levelDatabase.getStageByCity(stageCityName);
        if (stageInfo && stageInfo.levels[0] && stageInfo.levels[0].originalName) {
            currentLevelName = stageInfo.levels[0].originalName; // e.g., "Ice Cream Stand"
            console.log(`DEBUG: Stage start - using database originalName: "${currentLevelName}" (OCR read: "${originalLevelName}")`);
        } else {
            // Fallback to OCR result if database lookup fails
            currentLevelName = originalLevelName;
            console.log(`DEBUG: Stage start - database lookup failed, using OCR result: "${currentLevelName}"`);
        }
    } else {
        // Regular level - keep original name and increment counter for new levels
        currentLevelName = originalLevelName;
        console.log(`DEBUG: Regular level name set: "${currentLevelName}"`);
        
        // Check if we should start a partial stage (named level starting with no active stage)
        if (!stageTrackingEnabled || !currentStage) {
            console.log(`DEBUG: Named level "${currentLevelName}" starting without active stage - starting partial stage`);
            startPartialStage();
        }
        
        // Increment stage level counter for new levels (but not for stage start levels)
        if (currentStage && stageTrackingEnabled) {
            // Check if this is a new level we haven't seen before
            const isNewLevel = !currentStage.levels.some(level => level.name === currentLevelName);
            
            // Get expected level count for current stage (6 or 7 depending on whether stage has N/A)
            const stageInfo = levelDatabase.getStageByCity(currentStage.name);
            const expectedLevelCount = stageInfo ? stageInfo.levels.filter(l => l.name !== 'N/A').length : 7;
            
            console.log(`DEBUG: Level "${currentLevelName}" - isNewLevel: ${isNewLevel}, currentStageLevel: ${currentStageLevel}, expectedLevelCount: ${expectedLevelCount}, levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
            
            if (isNewLevel && currentStageLevel < expectedLevelCount) {
                currentStageLevel++;
                console.log(`DEBUG: Stage level incremented to ${currentStageLevel}/${expectedLevelCount} for new level: "${currentLevelName}"`);
            } else if (!isNewLevel) {
                console.log(`DEBUG: Level "${currentLevelName}" already exists in stage, not incrementing`);
            } else if (currentStageLevel >= expectedLevelCount) {
                console.log(`DEBUG: Stage already at max level (${currentStageLevel}/${expectedLevelCount}), not incrementing`);
            }
        }
    }
    
    // Map this level to the current stage ID to prevent cross-contamination
    if (currentStage && stageTrackingEnabled && currentLevelName && 
        currentLevelName !== 'Unknown Level' && currentLevelName !== 'Unnamed Level' && currentLevelName !== '') {
        levelToStageId.set(currentLevelName, currentStage.id);
        console.log(`DEBUG: Mapped level "${currentLevelName}" to stage "${currentStage.name}" (ID: ${currentStage.id})`);
    }
    
    console.log(`DEBUG: Current level name updated to: "${currentLevelName}"`);
    
    // Reset build count for this level when it starts
    levelBuildCounts.set(currentLevelName, 0);
    console.log(`DEBUG: Reset build count to 0 for level: "${currentLevelName}"`);
    
    // Send to renderer for UI update
    if (mainWindow && !mainWindow.isDestroyed()) {
        const levelAverage = historicalStats.getLevelAverage(currentLevelName);
        const levelAverageObj = historicalStats.getLevelAverageByDirection(currentLevelName);
        const levelBestObj = historicalStats.getLevelBest(currentLevelName);
        const levelLastObj = historicalStats.getLevelLast(currentLevelName);
        // Extract averages for up and down
        const levelAvgUp = levelAverageObj ? levelAverageObj.up : null;
        const levelAvgDown = levelAverageObj ? levelAverageObj.down : null;
        // Extract best times for up and down
        const levelBestUp = levelBestObj ? levelBestObj.up : null;
        const levelBestDown = levelBestObj ? levelBestObj.down : null;
        // Extract last times for up and down
        const levelLastUp = levelLastObj ? levelLastObj.up : null;
        const levelLastDown = levelLastObj ? levelLastObj.down : null;
        console.log(`DEBUG: Sending level data for "${currentLevelName}": avgUp=${levelAvgUp}, avgDown=${levelAvgDown}, bestUp=${levelBestUp}, bestDown=${levelBestDown}, lastUp=${levelLastUp}, lastDown=${levelLastDown}`);
        mainWindow.webContents.send('update-current-level-name', currentLevelName, levelAverage, levelAvgUp, levelAvgDown, levelBestUp, levelBestDown, levelLastUp, levelLastDown);
        // Also send stage info for enhanced UI
        sendStageInfoToRenderer();
    }
}

function setFinishedLevelName(levelName) {
    finishedLevelName = levelName || '';
    console.log(`DEBUG: Finished level name set to: "${finishedLevelName}"`);
}

function setCurrentEffectiveDirection(direction) {
    currentEffectiveDirection = direction;
    // Store the direction for the current level
    if (currentLevelName && currentLevelName !== 'Unknown Level') {
        levelDirections.set(currentLevelName, direction);
        console.log(`DEBUG: Stored direction "${direction}" for level "${currentLevelName}"`);
    }
    console.log(`DEBUG: Current effective direction set to: "${direction}"`);
}

// Stage management functions
function startNewStage(stageCityName) {
    const now = Date.now();
    
    // Complete the previous stage before starting the new one
    if (currentStage && stageTrackingEnabled) {
        console.log(`DEBUG: Completing previous stage "${currentStage.name}" before starting new stage "${stageCityName}"`);
        
        // Move current mappings to pending for grace period
        if (levelToStageId.size > 0) {
            console.log(`DEBUG: Moving ${levelToStageId.size} level mappings to pending for grace period`);
            for (const [levelName, stageId] of levelToStageId.entries()) {
                pendingLevelMappings.set(levelName, stageId);
            }
        }
        
        completeCurrentStage();
        
        // Set transition time for grace period
        stageTransitionTime = now;
        console.log(`DEBUG: Stage transition time set to ${stageTransitionTime}`);
    }
    
    currentStage = {
        name: stageCityName,
        startTime: now,
        levels: [],
        id: now, // Unique ID for this stage
        isPartial: false // Not a partial stage
    };
    
    currentStageLevel = 1; // First level of the stage
    
    // Check for offline play when starting a new stage
    const stageInfo = levelDatabase.getStageByCity(stageCityName);
    if (stageInfo) {
        const offlineLevels = dailyStats.checkAndHandleOfflinePlay(
            stageCityName,
            stageInfo.stageNumber,
            'Level 1', // First level of new stage
            1 // Position 1
        );
        if (offlineLevels > 0) {
            console.log(`OFFLINE PLAY DETECTED: ${offlineLevels} levels played offline and distributed`);
            // Update daily stats display after offline distribution
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-daily-stats', dailyStats.getTodayStats());
            }
        }
    }
    stageTrackingEnabled = true; // Enable tracking for this fresh stage
    
    console.log(`DEBUG: Started new stage: "${stageCityName}"`);
    
    // Start periodic cleanup of pending mappings
    if (!cleanupInterval) {
        cleanupInterval = setInterval(cleanupPendingMappings, 5000); // Check every 5 seconds
        console.log(`DEBUG: Started periodic cleanup of pending mappings`);
    }
}

// Clean up old pending mappings (called periodically)
function cleanupPendingMappings() {
    if (!stageTransitionTime) return;
    
    const now = Date.now();
    const gracePeriodMs = 30000; // 30 seconds grace period
    
    if (now - stageTransitionTime > gracePeriodMs) {
        console.log(`DEBUG: Cleaning up ${pendingLevelMappings.size} old pending mappings after grace period`);
        pendingLevelMappings.clear();
        stageTransitionTime = null;
    }
}

// Validate stage data integrity
function validateStageData(stage, stageName) {
    if (!stage) {
        console.error(`VALIDATION ERROR: ${stageName} stage is null`);
        return false;
    }
    
    if (!stage.name) {
        console.error(`VALIDATION ERROR: ${stageName} stage has no name`);
        return false;
    }
    
    if (!Array.isArray(stage.levels)) {
        console.error(`VALIDATION ERROR: ${stageName} stage levels is not an array:`, stage.levels);
        return false;
    }
    
    // Check for duplicate level names
    const levelNames = stage.levels.map(l => l.name);
    const uniqueNames = new Set(levelNames);
    if (levelNames.length !== uniqueNames.size) {
        console.error(`VALIDATION ERROR: ${stageName} stage has duplicate level names:`, levelNames);
        return false;
    }
    
    console.log(`VALIDATION: ${stageName} stage "${stage.name}" is valid with ${stage.levels.length} levels`);
    return true;
}

// Start a partial stage when we encounter a named level but don't know the stage yet
function startPartialStage() {
    const now = Date.now();
    
    // Force complete the previous stage if it exists
    if (currentStage && stageTrackingEnabled) {
        console.log(`DEBUG: Force completing previous stage "${currentStage.name}" before starting partial stage"`);
        completeCurrentStage();
    }
    
    currentStage = {
        name: "Unknown Stage",
        startTime: now,
        levels: [],
        id: now,
        isPartial: true, // Mark as partial
        deducedName: null // Will be set if we deduce the stage
    };
    
    currentStageLevel = 0; // We don't know the level position yet
    stageTrackingEnabled = true; // Enable tracking for partial stage
    
    console.log(`DEBUG: Started partial stage tracking`);
}

// Attempt to deduce the stage from completed level sequence
function attemptStageDeduction() {
    if (!currentStage || !currentStage.isPartial || currentStage.levels.length === 0) {
        return false;
    }
    
    const completedLevelNames = currentStage.levels.map(l => l.name);
    console.log(`DEBUG: Attempting stage deduction with levels: [${completedLevelNames.join(', ')}]`);
    
    // Get all stages from database
    const allStages = levelDatabase.getAllStages();
    const potentialMatches = [];
    
    // For each stage, check if our completed levels match a contiguous sequence
    for (const [stageName, stageData] of Object.entries(allStages)) {
        const stageLevels = stageData.levels.filter(l => l.name !== 'N/A');
        
        // Try to find where our sequence matches in this stage
        for (let startPos = 0; startPos <= stageLevels.length - completedLevelNames.length; startPos++) {
            let matches = true;
            
            for (let i = 0; i < completedLevelNames.length; i++) {
                const ourLevel = completedLevelNames[i];
                const stageLevel = stageLevels[startPos + i].name;
                
                // For position 1, check both 'Level 1' and originalName
                if (startPos + i === 0) {
                    const originalName = stageLevels[0].originalName;
                    if (ourLevel !== 'Level 1' && ourLevel !== stageLevel && ourLevel !== originalName) {
                        matches = false;
                        break;
                    }
                } else {
                    if (ourLevel !== stageLevel) {
                        matches = false;
                        break;
                    }
                }
            }
            
            if (matches) {
                potentialMatches.push({
                    stageName,
                    startPosition: startPos + 1, // 1-based position
                    confidence: completedLevelNames.length
                });
                break; // Found a match for this stage, no need to check other positions
            }
        }
    }
    
    console.log(`DEBUG: Found ${potentialMatches.length} potential stage matches`);
    
    // If we have exactly one match, we've deduced the stage
    if (potentialMatches.length === 1) {
        const match = potentialMatches[0];
        currentStage.deducedName = match.stageName;
        currentStage.name = match.stageName; // Update display name
        currentStageLevel = match.startPosition + completedLevelNames.length - 1; // Set current level position
        
        console.log(`DEBUG: Stage deduced as "${match.stageName}" starting at position ${match.startPosition}, currently at level ${currentStageLevel}`);
        return true;
    } else if (potentialMatches.length === 2) {
        // Check if these are duplicate stages (1-30 vs 31-60)
        // Get stage numbers for both matches
        const stageNumbers = potentialMatches.map(match => {
            const stageInfo = levelDatabase.getStageByCity(match.stageName);
            return stageInfo ? stageInfo.stageNumber : null;
        }).filter(num => num !== null);
        
        // Check if they differ by exactly 30 (indicating duplicates)
        if (stageNumbers.length === 2 && Math.abs(stageNumbers[0] - stageNumbers[1]) === 30) {
            console.log(`DEBUG: Found duplicate stages (${potentialMatches[0].stageName} #${stageNumbers[0]} and ${potentialMatches[1].stageName} #${stageNumbers[1]})`);
            
            // Use last completed stage to disambiguate
            const lastCompleted = historicalStats.getLastCompletedStage();
            if (lastCompleted && lastCompleted.stageNumber) {
                console.log(`DEBUG: Last completed stage: ${lastCompleted.name} (Stage #${lastCompleted.stageNumber})`);
                
                // Determine which loop we're in (1-30 or 31-60)
                let targetMatch;
                if (lastCompleted.stageNumber <= 30) {
                    // In first loop, pick the stage with number <= 30
                    targetMatch = potentialMatches.find(m => {
                        const info = levelDatabase.getStageByCity(m.stageName);
                        return info && info.stageNumber <= 30;
                    });
                } else {
                    // In second loop, pick the stage with number > 30
                    targetMatch = potentialMatches.find(m => {
                        const info = levelDatabase.getStageByCity(m.stageName);
                        return info && info.stageNumber > 30;
                    });
                }
                
                if (targetMatch) {
                    currentStage.deducedName = targetMatch.stageName;
                    currentStage.name = targetMatch.stageName;
                    currentStageLevel = targetMatch.startPosition + completedLevelNames.length - 1;
                    
                    const stageInfo = levelDatabase.getStageByCity(targetMatch.stageName);
                    console.log(`DEBUG: Disambiguated stage as "${targetMatch.stageName}" (Stage #${stageInfo.stageNumber}) based on last completed stage`);
                    return true;
                }
            } else {
                console.log(`DEBUG: No last completed stage info available to disambiguate - keeping as Unknown Stage`);
            }
        }
        
        console.log(`DEBUG: Stage ambiguous - multiple matches: [${potentialMatches.map(m => m.stageName).join(', ')}]`);
        return false;
    } else if (potentialMatches.length > 2) {
        console.log(`DEBUG: Stage ambiguous - multiple matches: [${potentialMatches.map(m => m.stageName).join(', ')}]`);
        return false;
    } else {
        console.log(`DEBUG: No stage matches found for current sequence`);
        return false;
    }
}

function completeCurrentStage() {
    if (!currentStage) return;
    
    // Prevent duplicate completion (only check if it's been less than 1 second since last completion)
    // This prevents duplicate calls within the same session but allows valid completions across sessions
    if (currentStage.completed && currentStage.endTime && (Date.now() - currentStage.endTime) < 1000) {
        console.log(`DEBUG: Stage "${currentStage.name}" already completed recently - skipping duplicate completion`);
        return;
    }
    
    const now = Date.now();
    const stageDurationMs = now - currentStage.startTime;
    
    // Mark as completed with timestamp
    currentStage.completed = true;
    
    // Complete the stage - create a proper deep copy to avoid reference issues
    const completedStage = {
        name: currentStage.name,
        startTime: currentStage.startTime,
        levels: currentStage.levels.map(level => ({
            name: level.name,
            durationMs: level.durationMs,
            completedAt: level.completedAt,
            direction: level.direction,
            comparisons: level.comparisons ? {
                average: level.comparisons.average ? { ...level.comparisons.average } : null,
                best: level.comparisons.best ? { ...level.comparisons.best } : null
            } : null
        })), // Create a deep copy of the levels array with all nested objects
        id: currentStage.id,
        isPartial: currentStage.isPartial,
        endTime: now,
        durationMs: stageDurationMs,
        levelCount: currentStage.levels.length
    };
    
    // Validate the completed stage data
    console.log(`DEBUG: Validating completed stage data:`);
    console.log(`  - Name: ${completedStage.name}`);
    console.log(`  - Level count: ${completedStage.levelCount}`);
    console.log(`  - Levels: [${completedStage.levels.map(l => l.name).join(', ')}]`);
    console.log(`  - Duration: ${completedStage.durationMs}ms`);
    console.log(`  - Is partial: ${completedStage.isPartial}`);
    
    // Only record to historical stats if this is NOT a partial stage
    if (!currentStage.isPartial) {
        // Get stage number from levelDatabase for recording
        const stageInfo = levelDatabase.getStageByCity(completedStage.name);
        const stageNumber = stageInfo ? stageInfo.stageNumber : null;
        
        // Record stage completion in historical stats
        historicalStats.recordStageCompletion(completedStage.name, stageDurationMs, stageNumber);
        dailyStats.recordStageCompletion(stageDurationMs);
        
        // Update daily stats display
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-daily-stats', dailyStats.getTodayStats());
        }
        
        // Update statistics
        completedStagesCount++;
        totalStagesDurationMs += stageDurationMs;
        
        // Update longest/shortest stages
        updateStageRecords(completedStage);
        
        console.log(`DEBUG: Completed full stage: "${completedStage.name}" (Stage #${stageNumber}) (${stageDurationMs}ms, ${completedStage.levelCount} levels)`);
    } else {
        console.log(`DEBUG: Completed partial stage: "${completedStage.name}" (${stageDurationMs}ms, ${completedStage.levelCount} levels) - NOT recording to historical stats`);
    }
    
    // Always update previousStage for display purposes
    previousStage = completedStage;
    console.log(`DEBUG: Set previousStage to "${previousStage.name}" with ${previousStage.levels.length} levels: [${previousStage.levels.map(l => l.name).join(', ')}]`);
    
    // Clear currentStage so renderer knows we're between stages
    currentStage = null;
    currentStageLevel = 0;
    console.log(`DEBUG: Cleared currentStage, previousStage now has ${previousStage.levels.length} levels`);
    console.log(`DEBUG: Previous stage levels after completion: [${previousStage.levels.map(l => l.name).join(', ')}]`);
    
    // Send updated stage info to renderer after completion
    sendStageInfoToRenderer();
}

function resetStageInformationForFreshStart() {
    // Reset stage information as if app was started fresh
    console.log('DEBUG: Resetting stage information for fresh start');
    currentStage = null;
    previousStage = null;
    stageTrackingEnabled = false;
    currentStageLevel = 0;
    levelToStageId.clear();
    longestStages = [];
    shortestStages = [];
    completedStagesCount = 0;
    totalStagesDurationMs = 0;
}

function updateStageRecords(completedStage) {
    // Update longest stages (top 3)
    longestStages.push(completedStage);
    longestStages.sort((a, b) => b.durationMs - a.durationMs);
    if (longestStages.length > 3) {
        longestStages = longestStages.slice(0, 3);
    }
    
    // Update shortest stages (top 3)
    shortestStages.push(completedStage);
    shortestStages.sort((a, b) => a.durationMs - b.durationMs);
    if (shortestStages.length > 3) {
        shortestStages = shortestStages.slice(0, 3);
    }
}

function formatDuration(durationMs) {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

function calculateLevelComparison(actualTime, levelName, direction = 'up') {
    // Get historical average for this level
    const stats = historicalStats.loadStats();
    const levelStats = stats.levels[levelName];
    
    // Use only the completions for the specified direction
    let directionCompletions = [];
    if (levelStats) {
        if (direction === 'up' && levelStats.completionsUp && Array.isArray(levelStats.completionsUp)) {
            directionCompletions = levelStats.completionsUp;
        } else if (direction === 'down' && levelStats.completionsDown && Array.isArray(levelStats.completionsDown)) {
            directionCompletions = levelStats.completionsDown;
        }
    }
    
    if (directionCompletions.length === 0) {
        return { arrow: '', timeDelta: '', cssClass: '' };
    }
    
    // Calculate average from direction-specific completions
    const avg = directionCompletions.reduce((sum, time) => sum + time, 0) / directionCompletions.length;
    
    // Calculate time difference in milliseconds
    const timeDiffMs = actualTime - avg;
    
    // Determine arrow, time delta text, and CSS class
    let arrow = '';
    let timeDelta = '';
    let cssClass = '';
    
    // Within 5 seconds (5000ms) is considered "unchanged" - blue
    if (Math.abs(timeDiffMs) < 5000) {
        arrow = '↔';
        timeDelta = `${(timeDiffMs / 1000).toFixed(1)}s`;
        cssClass = 'level-unchanged';
    } else if (timeDiffMs > 0) {
        // Slower than average - red
        arrow = '↑';
        timeDelta = `+${(timeDiffMs / 1000).toFixed(1)}s`;
        cssClass = 'level-slower';
    } else {
        // Faster than average - green
        arrow = '↓';
        timeDelta = `${(timeDiffMs / 1000).toFixed(1)}s`;
        cssClass = 'level-faster';
    }
    
    return { arrow, timeDelta, cssClass };
}

function calculateLevelComparisons(actualTime, levelName, direction = 'up', previousBestTime = null) {
    // Get historical average for this level
    const stats = historicalStats.loadStats();
    const levelStats = stats.levels[levelName];
    
    // Use only the completions for the specified direction
    let directionCompletions = [];
    if (levelStats) {
        if (direction === 'up' && levelStats.completionsUp && Array.isArray(levelStats.completionsUp)) {
            directionCompletions = levelStats.completionsUp;
        } else if (direction === 'down' && levelStats.completionsDown && Array.isArray(levelStats.completionsDown)) {
            directionCompletions = levelStats.completionsDown;
        }
    }
    
    if (directionCompletions.length === 0) {
        return { 
            average: { arrow: '', timeDelta: '', cssClass: '' },
            best: { arrow: '', timeDelta: '', cssClass: '' }
        };
    }
    
    // Calculate average
    const avg = directionCompletions.reduce((sum, time) => sum + time, 0) / directionCompletions.length;
    
    // Find best time for delta calculation - use previous best if provided, otherwise current best
    let best;
    if (previousBestTime !== null) {
        // Use previous best time for delta calculation (when a new best was just achieved)
        best = previousBestTime;
    } else if (levelStats.allTimeBestTimeUp && direction === 'up') {
        best = levelStats.allTimeBestTimeUp;
    } else if (levelStats.allTimeBestTimeDown && direction === 'down') {
        best = levelStats.allTimeBestTimeDown;
    } else {
        best = Math.min(...directionCompletions);
    }
    
    // Calculate average comparison
    const avgDiffMs = actualTime - avg;
    
    let avgArrow = '';
    let avgCssClass = '';
    let avgTimeDelta = '';
    
    if (Math.abs(avgDiffMs) < 5000) {
        // Within 5 seconds - blue
        avgArrow = '↔';
        avgCssClass = 'stage-level-blue';
        const deltaSeconds = (avgDiffMs / 1000).toFixed(1);
        // Show milliseconds if delta rounds to ±0.0s
        if (deltaSeconds === '0.0' || deltaSeconds === '-0.0') {
            avgTimeDelta = `${avgDiffMs >= 0 ? '+' : ''}${Math.round(avgDiffMs)}ms`;
        } else {
            avgTimeDelta = `${deltaSeconds}s`;
        }
    } else if (avgDiffMs > 0) {
        // Slower than average - red
        avgArrow = '↑';
        avgCssClass = 'stage-level-red';
        avgTimeDelta = `+${(avgDiffMs / 1000).toFixed(1)}s`;
    } else {
        // Faster than average - green
        avgArrow = '↓';
        avgCssClass = 'stage-level-green';
        avgTimeDelta = `${(avgDiffMs / 1000).toFixed(1)}s`;
    }
    
    // Calculate best comparison
    const bestDiffMs = actualTime - best;
    
    let bestArrow = '';
    let bestCssClass = '';
    let bestTimeDelta = '';
    
    if (bestDiffMs <= 0) {
        // Equal to or better than best time - gold (new best time)
        bestArrow = '↓';
        bestCssClass = 'stage-level-gold';
        const deltaSeconds = (bestDiffMs / 1000).toFixed(1);
        // Show milliseconds if delta rounds to ±0.0s
        if (deltaSeconds === '0.0' || deltaSeconds === '-0.0') {
            bestTimeDelta = `${bestDiffMs >= 0 ? '+' : ''}${Math.round(bestDiffMs)}ms`;
        } else {
            bestTimeDelta = `${deltaSeconds}s`;
        }
    } else if (bestDiffMs <= 1000) {
        // Within 1 second slower - blue
        bestArrow = '↔';
        bestCssClass = 'stage-level-blue';
        const deltaSeconds = (bestDiffMs / 1000).toFixed(1);
        // Show milliseconds if delta rounds to ±0.0s
        if (deltaSeconds === '0.0' || deltaSeconds === '-0.0') {
            bestTimeDelta = `+${Math.round(bestDiffMs)}ms`;
        } else {
            bestTimeDelta = `+${deltaSeconds}s`;
        }
    } else {
        // More than 1 second slower - red
        bestArrow = '↑';
        bestCssClass = 'stage-level-red';
        bestTimeDelta = `+${(bestDiffMs / 1000).toFixed(1)}s`;
    }
    
    return {
        average: { arrow: avgArrow, timeDelta: avgTimeDelta, cssClass: avgCssClass },
        best: { arrow: bestArrow, timeDelta: bestTimeDelta, cssClass: bestCssClass }
    };
}

function addLevelToCurrentStage(levelName, durationMs, effectiveDirection = null) {
    if (!currentStage || !stageTrackingEnabled) {
        console.log(`LEVEL ADD: Rejected - no stage (stageTrackingEnabled: ${stageTrackingEnabled}, currentStage: ${!!currentStage})`);
        return;
    }
    
    console.log(`LEVEL ADD: Attempting to add "${levelName}" (${durationMs}ms) to stage "${currentStage.name}"`);
    console.log(`LEVEL ADD: Current stage has ${currentStage.levels.length} levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
    
    // Check for duplicates - don't add the same level twice
    const isDuplicate = currentStage.levels.some(level => level.name === levelName);
    if (isDuplicate) {
        console.log(`LEVEL ADD: SKIPPED - Duplicate level "${levelName}" already in stage`);
        return;
    }
    
    // NOTE: Offline detection is only done at stage boundaries (in startNewStage)
    // to avoid false positives and double-counting
    
    // Record level completion in historical stats (use original name for "Level 1")
    const nameForStats = getOriginalLevelName(levelName);
    console.log(`LEVEL ADD: Resolved name for stats: "${levelName}" -> "${nameForStats}"`);
    
    // Use stored direction for this level, or effective direction if available, otherwise fall back to saved settings
    const levelSettings = settingsManager.getLevelSettings(nameForStats);
    const storedDirection = levelDirections.get(levelName);
    const direction = storedDirection || effectiveDirection || levelSettings.scrollDirection || 'up';
    console.log(`LEVEL ADD: Using direction: ${direction} (storedDirection: ${storedDirection}, effectiveDirection: ${effectiveDirection}, savedDirection: ${levelSettings.scrollDirection})`);
    
    let previousBestTime = null;
    if (nameForStats && nameForStats !== 'Unknown Level' && nameForStats !== 'Unnamed Level' && nameForStats !== 'Level 1') {
        previousBestTime = historicalStats.recordLevelCompletion(nameForStats, durationMs, direction);
        console.log(`[MAIN] About to record level in daily stats: "${nameForStats}" (${durationMs}ms)`);
        dailyStats.recordLevelCompletion(durationMs);
        console.log(`LEVEL ADD: Recorded in historical stats: "${nameForStats}" (${durationMs}ms, direction: ${direction})`);
    } else {
        console.log(`LEVEL ADD: NOT recorded in stats (nameForStats: "${nameForStats}")`);
    }
    
    // Calculate both average and best comparisons (after recording so we use updated stats)
    console.log(`DEBUG: Calculating comparisons for "${nameForStats}" (${durationMs}ms, direction: ${direction})`);
    const comparisons = calculateLevelComparisons(durationMs, nameForStats, direction, previousBestTime);
    console.log(`DEBUG: Comparison results:`, comparisons);
    
    const levelInfo = {
        name: levelName,
        durationMs: durationMs,
        completedAt: Date.now(),
        comparisons: comparisons, // Save both average and best comparison info for display
        direction: direction // Save direction for proper comparison calculation
    };
    
    currentStage.levels.push(levelInfo);
    console.log(`LEVEL ADD: SUCCESS - Added level #${currentStage.levels.length}`);
    console.log(`LEVEL ADD: Current stage now has levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
    
    // Update last known level position for offline detection (AFTER adding to array)
    if (nameForStats && nameForStats !== 'Unknown Level' && nameForStats !== 'Unnamed Level' && nameForStats !== 'Level 1') {
        if (currentStage && currentStage.name !== 'Unknown Stage') {
            const stageInfo = levelDatabase.getStageByCity(currentStage.name);
            if (stageInfo) {
                // Use actual position in array (which is now 1-based after push)
                const levelPosition = currentStage.levels.length;
                dailyStats.updateLastKnownLevel(
                    currentStage.name,
                    stageInfo.stageNumber,
                    nameForStats,
                    levelPosition
                );
                console.log(`OFFLINE TRACKING: Updated position - Stage ${stageInfo.stageNumber} (${currentStage.name}), Level ${levelPosition} (${nameForStats})`);
            }
        }
    }
    
    // Update daily stats display
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-daily-stats', dailyStats.getTodayStats());
    }
    
    // Note: currentStageLevel is incremented when new levels start, not when they complete
    
    // Check if stage is complete (6 or 7 levels depending on whether stage has N/A)
    // Get expected level count for this stage
    const stageInfo = levelDatabase.getStageByCity(currentStage.name);
    const expectedLevelCount = stageInfo ? stageInfo.levels.filter(l => l.name !== 'N/A').length : 7;
    
    console.log(`LEVEL ADD: Stage progress: ${currentStage.levels.length}/${expectedLevelCount} levels`);
    console.log(`LEVEL ADD: All stage levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
    
    if (currentStage.levels.length >= expectedLevelCount) {
        console.log(`DEBUG: Stage "${currentStage.name}" complete with ${currentStage.levels.length}/${expectedLevelCount} levels - moving to previous`);
        completeCurrentStage();
    }
}

function addLevelToCurrentStageIfValid(levelName, durationMs, effectiveDirection = null) {
    // Clean up old pending mappings first
    cleanupPendingMappings();
    
    // Check if we need a stage (partial stage should have been started when level began)
    if (!stageTrackingEnabled || !currentStage) {
        console.log(`DEBUG: No active stage when level "${levelName}" completed - level ignored`);
        return;
    }
    
    // Check current mappings first
    let mappedStageId = levelToStageId.get(levelName);
    let isPendingMapping = false;
    
    // If not found in current mappings, check pending mappings
    if (!mappedStageId) {
        mappedStageId = pendingLevelMappings.get(levelName);
        isPendingMapping = true;
        if (mappedStageId) {
            console.log(`DEBUG: Level "${levelName}" found in pending mappings (stage ID: ${mappedStageId})`);
        }
    }
    
    console.log(`DEBUG: Level "${levelName}" mapped to stage ID: ${mappedStageId}, current stage ID: ${currentStage ? currentStage.id : 'null'}, previous stage ID: ${previousStage ? previousStage.id : 'null'}, isPending: ${isPendingMapping}`);
    
    if (mappedStageId) {
        // Check if it belongs to the current stage
        if (currentStage && mappedStageId === currentStage.id) {
            console.log(`DEBUG: Adding level "${levelName}" to current stage "${currentStage.name}"`);
            addLevelToCurrentStage(levelName, durationMs, effectiveDirection);
            
            // If this is a partial stage, attempt deduction (guard if stage was cleared during add)
            if (currentStage && currentStage.isPartial) {
                const deduced = attemptStageDeduction();
                if (deduced) {
                    console.log(`DEBUG: Stage successfully deduced as "${currentStage.name}"`);
                }
            }
            
            // Clean up the mapping
            levelToStageId.delete(levelName);
            if (isPendingMapping) {
                pendingLevelMappings.delete(levelName);
            }
            // Send updated info to renderer
            sendStageInfoToRenderer();
        } 
        // Check if it belongs to the previous stage (recently completed)
        else if (previousStage && mappedStageId === previousStage.id) {
            console.log(`DEBUG: Adding level "${levelName}" to previous stage "${previousStage.name}" (late completion)`);
            
            // Record level completion in historical stats (use original name for "Level 1")
            const nameForStats = getOriginalLevelName(levelName);
            
            // Get current direction from settings (needed for comparison and saving)
            const levelSettings = settingsManager.getLevelSettings(nameForStats);
            const direction = levelSettings.scrollDirection || 'up';
            
            let previousBestTime = null;
            if (nameForStats && nameForStats !== 'Unknown Level' && nameForStats !== 'Unnamed Level' && nameForStats !== 'Level 1') {
                previousBestTime = historicalStats.recordLevelCompletion(nameForStats, durationMs, direction);
                // NOTE: Do NOT record in dailyStats here - this is a late completion for previous stage
                // The level was already counted in daily stats when it actually finished
                console.log(`[MAIN-PREV] Late completion for previous stage (NOT recording in daily stats): "${nameForStats}" (${durationMs}ms)`);
            }
            
            // Calculate both average and best comparisons (using previousBestTime for accurate delta)
            const comparisons = calculateLevelComparisons(durationMs, nameForStats, direction, previousBestTime);
            console.log(`DEBUG: Level comparisons for "${nameForStats}": avg: ${comparisons.average.arrow} ${comparisons.average.timeDelta}, best: ${comparisons.best.arrow} ${comparisons.best.timeDelta}`);
            
            // Add to previous stage's levels array
            previousStage.levels.push({
                name: levelName,
                durationMs: durationMs,
                completedAt: Date.now(),
                comparisons: comparisons, // Save both average and best comparison info
                direction: direction // Save direction for proper comparison calculation
            });
            console.log(`DEBUG: Previous stage "${previousStage.name}" now has ${previousStage.levels.length} levels: [${previousStage.levels.map(l => l.name).join(', ')}]`);
            
            // Clean up the mapping
            levelToStageId.delete(levelName);
            if (isPendingMapping) {
                pendingLevelMappings.delete(levelName);
            }
            // Send updated info to renderer
            sendStageInfoToRenderer();
        }
        else {
            console.log(`DEBUG: Skipping level "${levelName}" - belongs to unknown stage (ID: ${mappedStageId})`);
            // Clean up stale mapping
            levelToStageId.delete(levelName);
            if (isPendingMapping) {
                pendingLevelMappings.delete(levelName);
            }
        }
    } else {
        // NO FALLBACK - if a level has no mapping, it belongs to a previous stage and should be ignored
        console.log(`DEBUG: No stage mapping found for level "${levelName}" - IGNORING (belongs to previous stage)`);
    }
}

let lastStageInfoSent = null;

function sendStageInfoToRenderer() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    const stageInfo = {
        current: currentStage ? {
            name: currentStage.name,
            level: currentStageLevel,
            levels: currentStage.levels,
            startTime: currentStage.startTime,
            isPartial: currentStage.isPartial || false,
            currentLevelName: currentLevelName || 'Unknown Level', // Pass current level name for partial stages
            // Keep stats blank for partial stages
            historicalAverage: currentStage.isPartial ? null : historicalStats.getStageAverage(currentStage.name),
            historicalBest: currentStage.isPartial ? null : historicalStats.getStageBest(currentStage.name)
        } : null,
        previous: previousStage ? {
            ...previousStage,
            historicalAverage: historicalStats.getStageAverage(previousStage.name),
            historicalBest: historicalStats.getStageBest(previousStage.name),
            historicalLast: historicalStats.getStageLast(previousStage.name)
        } : null,
        longestStages: longestStages,
        shortestStages: shortestStages,
        completedCount: completedStagesCount,
        averageStageDuration: completedStagesCount > 0 ? totalStagesDurationMs / completedStagesCount : null,
        trackingEnabled: stageTrackingEnabled
    };
    
    // Log what we're sending to renderer
    if (stageInfo.current) {
        console.log(`SEND TO RENDERER: Current stage "${stageInfo.current.name}" with ${stageInfo.current.levels.length} levels: [${stageInfo.current.levels.map(l => l.name).join(', ')}]`);
        console.log(`SEND TO RENDERER: Current level position: ${stageInfo.current.level}, isPartial: ${stageInfo.current.isPartial}`);
    }
    
    // Check if this is a duplicate of the last sent stage info
    const stageInfoString = JSON.stringify(stageInfo);
    if (lastStageInfoSent === stageInfoString) {
        console.log(`DEBUG: Skipping duplicate stage info send`);
        return;
    }
    lastStageInfoSent = stageInfoString;
    
    // Validate stage data before sending
    if (currentStage && !validateStageData(currentStage, 'Current')) {
        console.error(`VALIDATION FAILED: Current stage data is invalid, not sending to renderer`);
        return;
    }
    
    if (previousStage && !validateStageData(previousStage, 'Previous')) {
        console.error(`VALIDATION FAILED: Previous stage data is invalid, not sending to renderer`);
        return;
    }
    
    // Debug logging for stage level counts
    if (currentStage) {
        console.log(`DEBUG: Sending stage info - Current stage "${currentStage.name}" has ${currentStage.levels.length} levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
    }
    if (previousStage) {
        console.log(`DEBUG: Sending stage info - Previous stage "${previousStage.name}" has ${previousStage.levels.length} levels: [${previousStage.levels.map(l => l.name).join(', ')}]`);
        console.log(`DEBUG: Previous stage ID: ${previousStage.id}, Current stage ID: ${currentStage ? currentStage.id : 'null'}`);
    }
    
    console.log(`DEBUG: Sending stage info to renderer - previous stage: ${stageInfo.previous ? stageInfo.previous.name : 'null'}`);
    mainWindow.webContents.send('update-stage-info', stageInfo);
}

function getBuildNumberForCurrentLevel() {
    // Get the current build count for this level (0 if not started yet)
    const currentCount = levelBuildCounts.get(currentLevelName) || 0;
    // The next build will be currentCount + 1
    const buildNumber = currentCount + 1;
    console.log(`DEBUG: Build number check - Level: "${currentLevelName}", Current count: ${currentCount}, Next build: ${buildNumber}`);
    return buildNumber;
}

function markFinishBuildRunForCurrentLevel() {
    const currentCount = levelBuildCounts.get(currentLevelName) || 0;
    levelBuildCounts.set(currentLevelName, currentCount + 1);
    console.log(`DEBUG: Marked finishBuild run for level: "${currentLevelName}", new count: ${currentCount + 1}`);
}

function getLevelNameForSettings() {
    // For unknown/unnamed levels, return empty string to ensure defaults are used
    if (!currentLevelName || currentLevelName === 'Unknown Level' || currentLevelName === 'Unnamed Level' || currentLevelName === '') {
        console.log(`DEBUG: Settings lookup - Level name is "${currentLevelName}", using empty string for defaults`);
        return '';
    }
    
    // If currentLevelName is "Level 1", look up the originalName from the database
    if (currentLevelName === 'Level 1' && currentStage) {
        const stageInfo = levelDatabase.getStageByCity(currentStage.name);
        if (stageInfo && stageInfo.levels[0] && stageInfo.levels[0].originalName) {
            const originalName = stageInfo.levels[0].originalName;
            console.log(`DEBUG: Settings lookup - Mapping "Level 1" to original name "${originalName}" for stage "${currentStage.name}"`);
            return originalName;
        }
    }
    // For all other levels, use currentLevelName as-is
    return currentLevelName;
}

// Helper function to convert "Level 1" to original name for any level name
function getOriginalLevelName(levelName) {
    // If levelName is "Level 1", look up the originalName from the database
    if (levelName === 'Level 1' && currentStage) {
        const stageInfo = levelDatabase.getStageByCity(currentStage.name);
        if (stageInfo && stageInfo.levels[0] && stageInfo.levels[0].originalName) {
            const originalName = stageInfo.levels[0].originalName;
            console.log(`DEBUG: Historical stats - Mapping "Level 1" to original name "${originalName}" for stage "${currentStage.name}"`);
            return originalName;
        }
    }
    // For all other levels, use levelName as-is
    return levelName;
}

function updateLongestLevels(duration, levelName) {
    if (!levelName || levelName.trim() === '' || levelName === 'Unknown Level') {
        console.log('DEBUG: Skipping longest levels update - no valid level name provided');
        return;
    }
    
    // Add the new level to the array
    longestLevels.push({ duration, name: levelName });
    
    // Sort by duration (longest first) and keep only top 3
    longestLevels.sort((a, b) => b.duration - a.duration);
    longestLevels = longestLevels.slice(0, 3);
    
    console.log('DEBUG: Updated longest levels:', longestLevels);
    
    // Send update to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-longest-levels', longestLevels);
    }
}

// Function to send current active function to renderer
function updateCurrentLevelDuration(durationMs) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        mainWindow.webContents.send('update-current-level-duration', `${minutes}m ${seconds}s`);
    }
}

// Function to send current active function to renderer
function updatePreviousLevelDuration(durationMs) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (durationMs === null) {
            mainWindow.webContents.send('update-previous-level-duration', 'N/A');
        } else {
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            mainWindow.webContents.send('update-previous-level-duration', `${minutes}m ${seconds}s`);
        }
    }
}

// New: Function to send longest level duration to renderer
function updateLongestLevelDuration(durationMs) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (durationMs === null) {
            mainWindow.webContents.send('update-longest-level-duration', 'N/A');
        } else {
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            mainWindow.webContents.send('update-longest-level-duration', `${minutes}m ${seconds}s`);
        }
    }
}

// New: Function to send shortest level duration to renderer
function updateShortestLevelDuration(durationMs) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (durationMs === null) {
            mainWindow.webContents.send('update-shortest-level-duration', 'N/A');
        } else {
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            mainWindow.webContents.send('update-shortest-level-duration', `${minutes}m ${seconds}s`);
        }
    }
}

// New: Function to send levels finished count to renderer
function updateLevelsFinishedCount(count) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-levels-finished-count', count);
    }
}

// New: Function to send average level duration to renderer
function updateAverageLevelDuration(durationMs) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (durationMs === null) {
            mainWindow.webContents.send('update-average-level-duration', 'N/A');
        } else {
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            mainWindow.webContents.send('update-average-level-duration', `${minutes}m ${seconds}s`);
        }
    }
}

// Define named click areas
const CLICK_AREAS = {
  OPEN_CLOSE_RESEARCH_WINDOW: { x: 403, y: 942 },
  INDIVIDUAL_RESEARCH: { x: 352, y: 456 },
  CLICK_OFF: { x: 425, y: 192 }, // Updated coordinates - old: { x: 420, y: 185 }
  "START_EXITING": { x: 49, y: 940 },
  "CONFIRM_EXIT": { x: 238, y: 745 },
  "START_LEVEL": { x: 232, y: 631 },
  "EXIT_LEVEL": { x: 51, y: 890 }, // New: Named click area for the exit level red blob
};

// New functions for click and hold using robotjs
async function clickDown(x, y) {
  try {
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before robotjs
    robot.moveMouse(x, y);
    robot.mouseToggle('down', 'left');
    return { success: true };
  } catch (error) {
    console.error(`Error robotjs down at (${x}, ${y}):`, error);
    return { success: false, error: error.message };
  }
}

async function clickUp(x, y) {
  try {
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before robotjs
    robot.moveMouse(x, y);
    robot.mouseToggle('up', 'left');
    return { success: true };
  } catch (error) {
    console.error(`Error robotjs up at (${x}, ${y}):`, error);
    return { success: false, error: error.message };
  }
}

async function clickAndHold(x, y, duration, getIsAutomationRunning) {
  try {
    // Move mouse to position and press down using robotjs
    robot.moveMouse(x, y);
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before mouse down
    robot.mouseToggle('down', 'left');

    const startTime = Date.now();
    let heldDuration = 0;
    const checkInterval = 100; // Check every 100ms

    // Hold the mouse button down for the specified duration
    while (heldDuration < duration && getIsAutomationRunning()) {
      await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, duration - heldDuration)));
      heldDuration = Date.now() - startTime;
    }

    // Always release the mouse button
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before mouse up
    robot.mouseToggle('up', 'left');
    
    return { success: true };
  } catch (error) {
    console.error(`Error in robotjs clickAndHold at (${x}, ${y}):`, error);
    // Ensure mouse button is released even on error
    try {
      robot.mouseToggle('up', 'left');
    } catch (releaseError) {
      console.error(`Error releasing mouse button:`, releaseError);
    }
    return { success: false, error: error.message };
  }
}

async function performRapidClicks(x, y, count) {
  try {
    // Use robotjs for direct, fast clicking
    robot.moveMouse(x, y);
    for (let i = 0; i < count; i++) {
      robot.mouseClick('left', false); // false = don't double click
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 1)); // 1ms wait between clicks
      }
    }
    return { success: true };
  } catch (error) {
    console.error(`Error performing rapid clicks at (${x}, ${y}):`, error);
    return { success: false, error: error.message };
  }
}

// New function to perform the click, called internally by main process
async function performClick(x, y) {
  console.log(`DEBUG: Performing click at X:${x}, Y:${y}`);
  try {
    // Removed app activation from here, it will be done once at automation start
    // await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
    // No delay needed here as activation is handled at start

    // Use robotjs to perform the click
    robot.moveMouse(x, y);
    robot.mouseClick('left', false); // false = don't double click
    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay to match original behavior
    return { success: true };
  } catch (error) {
    console.error(`Error simulating click at (${x}, ${y}):`, error);
    return { success: false, error: error.message };
  }
}

// New function for batched rapid clicks using robotjs (optimized for clickAround)
async function performBatchedClicks(clickArray) {
  if (!Array.isArray(clickArray) || clickArray.length === 0) {
    return { success: false, error: 'Invalid click array provided' };
  }

  console.log(`DEBUG: Using OPTIMIZED performBatchedClicks - ${clickArray.length} clicks with robotjs (no delays)`);
  
  try {
    // Use robotjs for direct, fast clicking without shell commands
    for (let i = 0; i < clickArray.length; i++) {
      const click = clickArray[i];
      robot.moveMouse(click.x, click.y);
      robot.mouseClick('left', false); // false = don't double click
      // No delay needed - robotjs is much faster than cliclick
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Error performing batched clicks with robotjs:`, error);
    return { success: false, error: error.message };
  }
}

// Connection health tracking and reconnection functions
function updateDetectionTime(detectionType) {
  const now = Date.now();
  if (detectionType === 'red_blob') {
    lastRedBlobDetectionTime = now;
  } else if (detectionType === 'blue_build') {
    lastBlueBuildDetectionTime = now;
  }
  console.log(`DEBUG: Updated ${detectionType} detection time to ${new Date(now).toISOString()}`);
}

function checkConnectionHealth() {
  const now = Date.now();
  const lastDetectionTime = Math.max(lastRedBlobDetectionTime, lastBlueBuildDetectionTime);
  const timeSinceLastDetection = now - lastDetectionTime;
  const oneMinuteMs = 60000;
  
  if (timeSinceLastDetection > oneMinuteMs && !isReconnecting) {
    const secondsSinceDetection = Math.floor(timeSinceLastDetection / 1000);
    console.warn(`WARNING: No red blob or blue build detected for ${secondsSinceDetection} seconds. Connection may be lost.`);
    return false;
  }
  
  return true;
}

async function attemptReconnection(iphoneMirroringRegion) {
  if (isReconnecting) {
    console.log('DEBUG: Reconnection already in progress, skipping duplicate attempt');
    return false;
  }
  
  isReconnecting = true;
  // Track downtime from last successful detection (not just reconnection process time)
  const lastDetectionTime = Math.max(lastRedBlobDetectionTime, lastBlueBuildDetectionTime);
  reconnectionStartTime = lastDetectionTime; // Start tracking from last successful detection
  console.log('========================================');
  console.log('RECONNECTION: Starting reconnection attempt...');
  console.log('========================================');
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', {
      message: 'Connection lost. Attempting reconnection...',
      type: 'warn'
    });
  }
  
  try {
    // Calculate click points along middle of screen (x=225)
    const clickX = 225;
    const topThirdY = Math.floor(iphoneMirroringRegion.y + iphoneMirroringRegion.height / 3);
    const bottomThirdY = Math.floor(iphoneMirroringRegion.y + (iphoneMirroringRegion.height * 2) / 3);
    
    console.log(`RECONNECTION: Clicking from Y=${topThirdY} to Y=${bottomThirdY} at X=${clickX}, spaced by 5 pixels`);
    
    // Click every 5 pixels from top third to bottom third
    let clickCount = 0;
    for (let y = topThirdY; y <= bottomThirdY; y += 5) {
      robot.moveMouse(clickX, y);
      robot.mouseClick('left', false);
      clickCount++;
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between clicks
    }
    
    console.log(`RECONNECTION: Completed ${clickCount} reconnection clicks`);
    
    // Wait a bit for the connection to re-establish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reset detection times to current time to give system a fresh start
    lastRedBlobDetectionTime = Date.now();
    lastBlueBuildDetectionTime = Date.now();
    
    // Calculate and accumulate the downtime for this reconnection
    // This includes both the detection timeout period AND the reconnection process
    const downtimeMs = Date.now() - reconnectionStartTime;
    reconnectionDowntimeMs += downtimeMs;
    const downtimeSeconds = (downtimeMs / 1000).toFixed(1);
    const totalDowntimeSeconds = (reconnectionDowntimeMs / 1000).toFixed(1);
    console.log(`RECONNECTION: Downtime for this reconnection: ${downtimeSeconds}s (includes detection timeout + reconnection). Total level downtime: ${totalDowntimeSeconds}s`);
    
    console.log('RECONNECTION: Reconnection attempt complete. Restarting automation...');
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        message: 'Reconnection complete. Restarting level...',
        type: 'success'
      });
    }
    
    isReconnecting = false;
    reconnectionStartTime = null; // Reset
    return true;
    
  } catch (error) {
    console.error('RECONNECTION ERROR:', error);
    isReconnecting = false;
    reconnectionStartTime = null; // Reset
    return false;
  }
}

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Load saved window state or use defaults
    const savedState = loadWindowState();
    let windowOptions = {
        width: 1200,
        height: 950,
        show: true, // Ensure the window is shown
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
    };

    if (savedState) {
        // Use saved position and size if available
        windowOptions.x = savedState.x;
        windowOptions.y = savedState.y;
        windowOptions.width = savedState.width;
        windowOptions.height = savedState.height;
    } else {
        // Calculate the desired starting X position, offsetting by 100 pixels
        const startX = Math.round((width - 1200) / 2) + 100; // Center then shift right
        const startY = Math.max(0, Math.round((height - 950) / 2)); // Center vertically, ensure it fits on screen
        windowOptions.x = startX;
        windowOptions.y = startY;
    }

    mainWindow = new BrowserWindow(windowOptions);

    // Restore maximized state if it was saved
    if (savedState && savedState.isMaximized) {
        mainWindow.maximize();
    }

    mainWindow.loadFile('index.html');

    // Save window state when it changes
    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);
    mainWindow.on('maximize', saveWindowState);
    mainWindow.on('unmaximize', saveWindowState);
    
    // Save window state before closing
    mainWindow.on('close', () => {
        saveWindowState();
    });
  
    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

// Default iPhone Mirroring region
let iphoneMirroringRegion = {
  x: 0,
  y: 100,
  width: 450,
  height: 900
};

// Track whether we're using window capture (true) or screen capture (false)
let isUsingWindowCapture = false;

// Screen capture using desktopCapturer
async function captureScreenRegion() {
  try {
    // Get all screen sources
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    
    if (sources.length === 0) {
      throw new Error('No screen sources found');
    }
    
    // Use the primary screen and return the full screenshot
    // The cropping will be done in the renderer process
    return sources[0].thumbnail.toDataURL();
  } catch (error) {
    console.error('Error capturing screen:', error);
    throw error;
  }
}

// Find iPhone Mirroring app window using a simpler approach
async function findIPhoneMirroringWindow() {
  try {
    // Try to get running processes
    const { stdout } = await execAsync('ps aux | grep -i "iphone\|lonelyscreen\|reflector\|airserver" | grep -v grep');
    
    if (stdout.trim()) {
      // If we find the process, try to get screen dimensions and suggest a region
      const screenSize = screen.getPrimaryDisplay().workAreaSize;
      
      // Suggest the default region (left side of screen)
      const suggestedWidth = 450;
      const suggestedHeight = 900;
      const x = 0;
      const y = 100;
      
      return { x, y, width: suggestedWidth, height: suggestedHeight };
    }
    return null;
  } catch (error) {
    console.error('Error finding iPhone Mirroring window:', error);
    return null;
  }
}

// Auto-detect and update region
async function autoDetectIPhoneMirroring() {
  try {
    const windowInfo = await findIPhoneMirroringWindow();
    if (windowInfo) {
      iphoneMirroringRegion = windowInfo;
      return windowInfo;
    }
    
    // If process detection fails, use the default region
    const suggestedWidth = 450;
    const suggestedHeight = 900;
    const x = 0;
    const y = 100;
    
    const suggestedRegion = { x, y, width: suggestedWidth, height: suggestedHeight };
    iphoneMirroringRegion = suggestedRegion;
    return suggestedRegion;
  } catch (error) {
    console.error('Error auto-detecting iPhone Mirroring:', error);
    return null;
  }
}

// IPC handlers will be setup when app is ready

function setupIpcHandlers() {
ipcMain.handle('auto-detect-iphone-mirroring', async () => {
  try {
    const windowInfo = await autoDetectIPhoneMirroring();
    if (windowInfo) {
      return { success: true, region: windowInfo };
    } else {
      return { success: false, error: 'iPhone Mirroring app not found' };
    }
  } catch (error) {
    console.error('Error auto-detecting iPhone Mirroring:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pick-region', async () => {
  try {
    // Take a full screen screenshot for region picking
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    
    if (sources.length === 0) {
      throw new Error('No screen sources found');
    }
    
    return { success: true, screenshot: sources[0].thumbnail.toDataURL() };
  } catch (error) {
    console.error('Error taking screenshot for region picking:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-capture-region', async (event, region) => {
  try {
    iphoneMirroringRegion = region;
    return { success: true };
  } catch (error) {
    console.error('Error setting capture region:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-capture-region', async () => {
  return iphoneMirroringRegion;
});

// Statistics data handlers
// IPC handler for renderer logging (so logs go to console.log file, not Chrome DevTools)
ipcMain.handle('renderer-log', async (event, message) => {
  console.log(`RENDERER: ${message}`);
});

ipcMain.handle('get-historical-stats', async () => {
  return historicalStats.loadStats();
});

ipcMain.handle('get-level-database', async () => {
  return levelDatabase.LEVEL_DATABASE;
});

ipcMain.handle('get-level-average', async (event, levelName) => {
  return historicalStats.getLevelAverage(levelName);
});

ipcMain.handle('get-level-best', async (event, levelName) => {
  return historicalStats.getLevelBest(levelName);
});

ipcMain.handle('get-level-last', async (event, levelName) => {
  return historicalStats.getLevelLast(levelName);
});

// Settings IPC handlers
ipcMain.handle('get-all-level-names', async () => {
  return settingsManager.getAllLevelNames();
});

ipcMain.handle('reload-settings', async () => {
  settingsManager.reloadSettings();
  return { success: true };
});

ipcMain.handle('get-level-settings', async (event, levelName) => {
  return settingsManager.getLevelSettings(levelName);
});

ipcMain.handle('get-direction-settings', async (event, levelName, direction) => {
  return settingsManager.getDirectionSettings(levelName, direction);
});

// Global direction mode
ipcMain.handle('get-direction-mode', async () => {
  return settingsManager.getDirectionMode();
});

ipcMain.handle('set-direction-mode', async (event, mode) => {
  try {
    settingsManager.setDirectionMode(mode);
    const saved = settingsManager.saveSettings();
    return { success: saved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('save-level-settings', async (event, levelName, settings) => {
  try {
    settingsManager.updateLevelSettings(levelName, settings);
    const saved = settingsManager.saveSettings();
    return { success: saved };
  } catch (error) {
    console.error('Error saving level settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('switch-direction', async (event, levelName, newDirection) => {
  try {
    settingsManager.switchDirection(levelName, newDirection);
    const saved = settingsManager.saveSettings();
    return { success: saved };
  } catch (error) {
    console.error('Error switching direction:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-direction-settings', async (event, levelName, direction, settings) => {
  try {
    settingsManager.updateDirectionSettings(levelName, direction, settings);
    const saved = settingsManager.saveSettings();
    return { success: saved };
  } catch (error) {
    console.error('Error saving direction settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reset-level-to-defaults', async (event, levelName) => {
  try {
    // Remove level-specific settings to use defaults
    settingsManager.updateLevelSettings(levelName, {});
    const saved = settingsManager.saveSettings();
    return { success: saved };
  } catch (error) {
    console.error('Error resetting level settings:', error);
    return { success: false, error: error.message };
  }
});

// Custom triggers IPC handlers
ipcMain.handle('get-custom-triggers', async (event, levelName) => {
  return settingsManager.getCustomTriggers(levelName);
});

ipcMain.handle('add-custom-trigger', async (event, levelName, trigger) => {
  try {
    settingsManager.addCustomTrigger(levelName, trigger);
    return { success: true };
  } catch (error) {
    console.error('Error adding custom trigger:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-custom-trigger', async (event, levelName, index, trigger) => {
  try {
    settingsManager.updateCustomTrigger(levelName, index, trigger);
    return { success: true };
  } catch (error) {
    console.error('Error updating custom trigger:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-custom-trigger', async (event, levelName, index) => {
  try {
    settingsManager.removeCustomTrigger(levelName, index);
    return { success: true };
  } catch (error) {
    console.error('Error removing custom trigger:', error);
    return { success: false, error: error.message };
  }
});

// New levels statistics page handlers

ipcMain.handle('delete-level', async (event, levelName) => {
  try {
    // Delete the level from historical stats
    const historicalStats = require('./lib/historicalStats');
    const result = historicalStats.deleteLevel(levelName);
    
    if (result.success) {
      // Also remove from settings if it exists
      settingsManager.deleteLevel(levelName);
      settingsManager.saveSettings();
      
      console.log(`Successfully deleted level: ${levelName}`);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Error deleting level:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-trigger-types', async () => {
  return settingsManager.getTriggerTypes();
});

ipcMain.handle('get-trigger-actions', async () => {
  return settingsManager.getTriggerActions();
});

ipcMain.handle('recalculate-all-time-bests', async (event) => {
  try {
    const result = historicalStats.recalculateAllTimeBests();
    return result;
  } catch (error) {
    console.error('Error recalculating all-time bests:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-daily-stats-today', async (event) => {
  try {
    return dailyStats.getTodayStats();
  } catch (error) {
    console.error('Error getting today stats:', error);
    return null;
  }
});

ipcMain.handle('get-daily-stats-recent', async (event, days) => {
  try {
    return dailyStats.getRecentDays(days || 7);
  } catch (error) {
    console.error('Error getting recent daily stats:', error);
    return [];
  }
});

ipcMain.handle('get-current-level-name', async () => {
  return currentLevelName || '';
});

ipcMain.handle('capture-iphone-mirroring', async () => {
  try {
    const dataUrl = await captureScreenRegion();
    return dataUrl;
  } catch (error) {
    console.error('iPhone Mirroring capture error:', error);
    throw error;
  }
});

// IPC handlers for detection
ipcMain.handle('detect-red-blob', async () => {
  try {
    const fullScreenDataUrl = await captureScreenRegion();
    
    // Log captured image dimensions for debugging
    const imageBuffer = Buffer.from(fullScreenDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const sharpImage = sharp(imageBuffer);
    const metadata = await sharpImage.metadata();

    const mainDetections = await redBlobDetector.detect(fullScreenDataUrl, iphoneMirroringRegion);
    const cutoffDetections = await redBlobDetectorCutoff.detect(fullScreenDataUrl, iphoneMirroringRegion);

    // Add source property to each detection
    const allDetections = [
      ...mainDetections.map(d => ({ ...d, source: 'main' })),
      ...cutoffDetections.map(d => ({ ...d, source: 'cutoff' }))
    ];

    // Broadcast detection results for overlay
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('detection-results', { 
        redBlobs: allDetections, 
        blueBoxes: [] 
      });
    }

    return { success: true, detections: allDetections };
  } catch (error) {
    console.error('Error detecting red blobs:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('detect-blue-box', async () => {
  try {
    const fullScreenDataUrl = await captureScreenRegion();

    // Log captured image dimensions for debugging
    const imageBuffer = Buffer.from(fullScreenDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const sharpImage = sharp(imageBuffer);
    const metadata = await sharpImage.metadata();

    const detections = await blueBoxDetector.detect(fullScreenDataUrl, iphoneMirroringRegion);
    
    // Broadcast detection results for overlay
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('detection-results', { 
        redBlobs: [], 
        blueBoxes: detections 
      });
    }
    
    return { success: true, detections };
  } catch (error) {
    console.error('Error detecting blue boxes:', error);
    return { success: false, error: error.message };
  }
});

// Function to start the Finish Build automation loop
async function startFinishBuildAutomationLoop() {
  updateCurrentFunction('startFinishBuildAutomationLoop'); // Update current function
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('finish-build-status', 'Starting automation loop...', 'info');
  }

  // Dependencies for the automation protocol
  const automationDependencies = {
    mainWindow, // Add mainWindow for IPC events
    performClick,
    performBatchedClicks, // Add missing performBatchedClicks for finishBuild
    clickDown,
    clickUp,
    clickAndHold,
    performRapidClicks,
    CLICK_AREAS,
    redBlobDetectorDetect: async (imageData, region) => {
      const results = await redBlobDetector.detect(imageData, region, isUsingWindowCapture);
      // Update detection time if red blobs found
      if (results && results.length > 0) {
        updateDetectionTime('red_blob');
      }
      // Broadcast detection results for overlay
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('detection-results', { 
          redBlobs: results, 
          blueBoxes: [] 
        });
      }
      return results;
    },
    detectBlueBoxes: async (imageData, region) => {
      const results = await blueBoxDetector.detect(imageData, region, isUsingWindowCapture);
      // Update detection time if blue builds found
      if (results && results.length > 0) {
        updateDetectionTime('blue_build');
      }
      // Broadcast detection results for overlay
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('detection-results', { 
          redBlobs: [], 
          blueBoxes: results 
        });
      }
      return results;
    },
    captureScreenRegion,
    updateStatus: (message, type) => { // Pass a function to send status updates to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Add new message to history and maintain limit
        statusMessageHistory.push({ message, type, timestamp: new Date().toLocaleTimeString() });
        if (statusMessageHistory.length > STATUS_MESSAGE_LIMIT) {
          statusMessageHistory.shift(); // Remove oldest message
        }
        mainWindow.webContents.send('finish-build-status', message, type);
        mainWindow.webContents.send('finish-build-status-list', statusMessageHistory);
      }
    },
    updateCurrentFunction: updateCurrentFunction, // Pass the new function
    iphoneMirroringRegion: iphoneMirroringRegion, // Pass the current region
    getIphoneMirroringRegion: () => iphoneMirroringRegion, // Getter for dynamic region updates
    getlastBlueBoxClickCoords: () => lastBlueBoxClickCoords,
    setlastBlueBoxClickCoords: (coords) => { lastBlueBoxClickCoords = coords; },
    getIsHoldingBlueBox: () => isHoldingBlueBox, // Pass getter for the state
    setIsHoldingBlueBox: (state) => { isHoldingBlueBox = state; }, // Pass setter for the state
    getIsAutomationRunning: () => isAutomationRunning, // Pass getter for the automation running state
    setIsAutomationRunning: (state) => { isAutomationRunning = state; }, // Pass setter for automation running state
    scrollToBottom: scrollToBottom, // Pass scrollToBottom function
    scrollSwipeDistance: scrollSwipeDistance, // Pass scroll swipe distance
    // For pausing/resuming based on user input, the main loop manages this part
    // New: Pass functions to update level durations
    updateCurrentLevelDuration: updateCurrentLevelDuration,
    updatePreviousLevelDuration: updatePreviousLevelDuration,
    updateLongestLevelDuration: updateLongestLevelDuration, // New: Pass new function
    updateShortestLevelDuration: updateShortestLevelDuration, // New: Pass new function
    updateLevelsFinishedCount: updateLevelsFinishedCount, // New: Pass new function
    updateAverageLevelDuration: updateAverageLevelDuration, // New: Pass new function
    finishBuildAutomationRunBuildProtocol: finishBuildAutomation.runBuildProtocol, // Pass the runBuildProtocol from finishBuildAutomation
    getClickAroundCallCounter: getClickAroundCallCounter, // New: Pass counter functions
    incrementClickAroundCallCounter: incrementClickAroundCallCounter,
    resetClickAroundCallCounter: resetClickAroundCallCounter,
    // New: Level name management functions
    getCurrentLevelName: getCurrentLevelName,
    getLevelNameForSettings: getLevelNameForSettings,
    getBuildNumberForCurrentLevel: getBuildNumberForCurrentLevel,
    markFinishBuildRunForCurrentLevel: markFinishBuildRunForCurrentLevel,
    // Connection health and reconnection
    updateDetectionTime: updateDetectionTime,
    checkConnectionHealth: checkConnectionHealth,
    attemptReconnection: attemptReconnection,
  };

  // Start the automation loop in finishBuild.js
  finishBuildAutomation.runBuildProtocol(automationDependencies);
}

ipcMain.handle('toggle-finish-build', async (event, isRunning) => {
  if (isRunning) {
    updateCurrentFunction('toggle-finish-build'); // Update current function
    isAutomationRunning = isRunning; // Update the global flag
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Starting Finish Build automation...', 'info');
    }
    // Bring the iPhone Mirroring app to the front once at the start of automation
    await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Short delay after activation

    startFinishBuildAutomationLoop();
  } else {
    isAutomationRunning = isRunning; // Update the global flag to false
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Stopping Finish Build automation...', 'info');
    }
    if (pauseTimeout) {
      clearTimeout(pauseTimeout);
      pauseTimeout = null;
    }
    // Call the stopAutomation function in finishBuild.js
    await finishBuildAutomation.stopAutomation({
      updateStatus: (message, type) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          statusMessageHistory.push({ message, type, timestamp: new Date().toLocaleTimeString() });
          if (statusMessageHistory.length > STATUS_MESSAGE_LIMIT) {
            statusMessageHistory.shift();
          }
          mainWindow.webContents.send('finish-build-status', message, type);
          mainWindow.webContents.send('finish-build-status-list', statusMessageHistory);
        }
      },
      setIsHoldingBlueBox: (state) => { isHoldingBlueBox = state; },
      clickUp: clickUp,
      getlastBlueBoxClickCoords: () => lastBlueBoxClickCoords,
      setlastBlueBoxClickCoords: (coords) => { lastBlueBoxClickCoords = coords; },
      setIsAutomationRunning: (state) => { isAutomationRunning = state; }, // Pass setter for automation running state
    });
  }
});

ipcMain.handle('toggle-finish-level', async (event, isRunning, scrollSwipeDistance, scrollToBottomIterations, scrollUpAttempts) => {
  if (isAutomationRunning) {
    console.log('ERROR: Finish Build automation is already running. Cannot start Finish Level.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Finish Build already running. Cannot start Finish Level.', 'error');
    }
    return;
  }

  isFinishLevelRunning = isRunning;
  if (isRunning) {
    // Reset stage information when automation starts
    console.log('DEBUG: Finish Level automation starting - resetting stage information');
    resetStageInformationForFreshStart();
    
    // Clear level name and overlays at start of finish level automation
    // This makes the app behave as if it was just loaded
    updateCurrentLevelName(''); // Set to empty string (unnamed level)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('clear-overlays');
    }
    
    updateCurrentFunction('toggle-finish-level'); // Update current function
    currentLevelStartTime = Date.now(); // Start timer for current level
    reconnectionDowntimeMs = 0; // Reset reconnection downtime for new level
    updatePreviousLevelDuration(previousLevelDurationMs); // Display previous level duration
    updateLongestLevelDuration(longestLevelDurationMs); // New: Display longest level duration
    updateShortestLevelDuration(shortestLevelDurationMs); // New: Display shortest level duration
    updateLevelsFinishedCount(levelsFinishedCount); // New: Display levels finished count
    updateAverageLevelDuration(totalLevelsDurationMs > 0 && levelsFinishedCount > 0 ? totalLevelsDurationMs / levelsFinishedCount : null); // New: Display average duration
    // Start an interval to update the current level duration
    const levelTimerInterval = setInterval(() => {
        if (isFinishLevelRunning) {
            const elapsedTime = Date.now() - currentLevelStartTime;
            updateCurrentLevelDuration(elapsedTime);
        } else {
            clearInterval(levelTimerInterval);
            updateCurrentLevelDuration(0); // Reset display when stopped
        }
    }, 1000); // Update every second
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('finish-build-status', `Finish Level Automation ${isRunning ? 'Started' : 'Stopped'}.`, 'info');
  }

  const automationDependencies = {
    mainWindow, // Add mainWindow for IPC events
    performClick,
    performBatchedClicks, // Add missing performBatchedClicks for finishLevel
    clickDown,
    clickUp,
    clickAndHold,
    performRapidClicks,
    CLICK_AREAS,
    redBlobDetectorDetect: async (imageData, region) => {
      const results = await redBlobDetector.detect(imageData, region, isUsingWindowCapture);
      // Update detection time if red blobs found
      if (results && results.length > 0) {
        updateDetectionTime('red_blob');
      }
      // Broadcast detection results for overlay
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('detection-results', { 
          redBlobs: results, 
          blueBoxes: [] 
        });
      }
      return results;
    },
    detectBlueBoxes: async (imageData, region) => {
      const results = await blueBoxDetector.detect(imageData, region, isUsingWindowCapture);
      // Update detection time if blue builds found
      if (results && results.length > 0) {
        updateDetectionTime('blue_build');
      }
      // Broadcast detection results for overlay
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('detection-results', { 
          redBlobs: [], 
          blueBoxes: results 
        });
      }
      return results;
    },
    captureScreenRegion,
    updateStatus: (message, type) => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          statusMessageHistory.push({ message, type, timestamp: new Date().toLocaleTimeString() });
          if (statusMessageHistory.length > STATUS_MESSAGE_LIMIT) {
            statusMessageHistory.shift();
          }
          mainWindow.webContents.send('finish-build-status', message, type);
          mainWindow.webContents.send('finish-build-status-list', statusMessageHistory);
          
          // Clear overlays when starting a new level
          if (message.includes('Starting "Exit and Start New Level" routine')) {
            mainWindow.webContents.send('clear-overlays');
          }
        }
      } catch (error) {
        console.error('Error in updateStatus:', error);
      }
    },
    updateCurrentFunction: updateCurrentFunction, // Pass the new function
    iphoneMirroringRegion: iphoneMirroringRegion,
    getlastBlueBoxClickCoords: () => lastBlueBoxClickCoords,
    setlastBlueBoxClickCoords: (coords) => { lastBlueBoxClickCoords = coords; },
    getIsHoldingBlueBox: () => isHoldingBlueBox,
    setIsHoldingBlueBox: (state) => { isHoldingBlueBox = state; },
    getIsAutomationRunning: () => isFinishLevelRunning, // Use its own state for finish level
    setIsAutomationRunning: (state) => { isFinishLevelRunning = state; }, // Pass setter for automation running state
    finishBuildAutomationRunBuildProtocol: finishBuildAutomation.runBuildProtocol, // Pass the runBuildProtocol from finishBuildAutomation
    scrollDown: async (x, y, distance) => {
      // Broadcast scroll event for overlay clearing
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scroll-occurred');
      }
      return scrollingFunctions.scrollDown(x, y, distance);
    },
    scrollUp: async (x, y, dependencies) => {
      // Broadcast scroll event for overlay clearing
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scroll-occurred');
      }
      return scrollingFunctions.scrollUp(x, y, dependencies);
    },
    scrollUpWithDistance: async (x, y, distance) => {
      // Broadcast scroll event for overlay clearing
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scroll-occurred');
      }
      return scrollingFunctions.scrollUpWithDistance(x, y, distance);
    },
    scrollToBottom: async (x, y, distance, count, dependencies) => {
      // Broadcast scroll event for overlay clearing
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scroll-occurred');
      }
      return scrollingFunctions.scrollToBottom(x, y, distance, count, dependencies);
    },
    scrollToTop: async (dependencies) => {
      // Broadcast scroll event for overlay clearing
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scroll-occurred');
      }
      return scrollingFunctions.scrollToTop(dependencies);
    },
    getRandomInt: scrollingFunctions.getRandomInt, // New: Pass getRandomInt function
    scrollSwipeDistance: scrollSwipeDistance, // New: Pass scroll swipe distance
    scrollToBottomIterations: scrollToBottomIterations, // New: Pass scroll to bottom iterations
    scrollUpAttempts: scrollUpAttempts, // New: Pass scroll up attempts
    // New: Functions to handle level duration updates
    updateCurrentLevelDuration: updateCurrentLevelDuration,
    getEffectiveDirectionForLevel: () => {
      // This function will be set by the automation when a level starts
      return currentEffectiveDirection;
    },
    setCurrentEffectiveDirection: setCurrentEffectiveDirection,
    updatePreviousLevelDuration: (duration) => {
        previousLevelDurationMs = duration;
        
        // Only track statistics for named levels (exclude "Unknown Level" and empty strings)
        if (finishedLevelName && finishedLevelName.trim() !== '' && finishedLevelName !== 'Unknown Level') {
            levelsFinishedCount++; // Increment count of finished levels
            totalLevelsDurationMs += duration; // Add to total duration

            // Note: Level completion is already recorded through stage tracking system
            // No need for fallback recording here (would cause duplicates)

            // Update longest levels tracking with finished level name
            updateLongestLevels(duration, finishedLevelName);

            // Update longest and shortest durations
            if (longestLevelDurationMs === null || duration > longestLevelDurationMs) {
                longestLevelDurationMs = duration;
            }
            if (shortestLevelDurationMs === null || duration < shortestLevelDurationMs) {
                shortestLevelDurationMs = duration;
            }

            updateLongestLevelDuration(longestLevelDurationMs); // Update display
            updateShortestLevelDuration(shortestLevelDurationMs); // Update display
            updateLevelsFinishedCount(levelsFinishedCount); // Update display
            updateAverageLevelDuration(levelsFinishedCount > 0 ? totalLevelsDurationMs / levelsFinishedCount : null); // Update display
            
            // Add level to stage tracking (but only if it belongs to current stage)
            // Get the effective direction that was actually used during gameplay
            const effectiveDirection = currentEffectiveDirection;
            addLevelToCurrentStageIfValid(finishedLevelName, duration, effectiveDirection);
        }

        // Always update the previous level duration display (for unnamed levels too)
        updatePreviousLevelDuration(duration);
        currentLevelStartTime = Date.now(); // Reset current level timer
        
        // Clean up stored direction for the finished level
        if (finishedLevelName) {
            levelDirections.delete(finishedLevelName);
            console.log(`DEBUG: Cleaned up stored direction for finished level: "${finishedLevelName}"`);
        }
        reconnectionDowntimeMs = 0; // Reset reconnection downtime for new level
        
        // Note: sendStageInfoToRenderer() is already called by updateCurrentLevelName() above
    },
    // New: Pass a getter function for the current level start time
    getCurrentLevelStartTime: () => currentLevelStartTime,
    // New: Pass a getter function for the reconnection downtime
    getReconnectionDowntimeMs: () => reconnectionDowntimeMs,
    // New: Pass counter functions for clickAround calls
    getClickAroundCallCounter: getClickAroundCallCounter,
    incrementClickAroundCallCounter: incrementClickAroundCallCounter,
    resetClickAroundCallCounter: resetClickAroundCallCounter,
    // New: Level name management and OCR functions
    getCurrentLevelName: getCurrentLevelName,
    getLevelNameForSettings: getLevelNameForSettings,
    updateCurrentLevelName: updateCurrentLevelName,
    setFinishedLevelName: setFinishedLevelName,
    captureLevelName: ocrUtils.captureLevelName,
    getBuildNumberForCurrentLevel: getBuildNumberForCurrentLevel,
    markFinishBuildRunForCurrentLevel: markFinishBuildRunForCurrentLevel,
    // New: Image comparison functions for scroll top detection
    compareTopRegions: imageComparison.compareTopRegions,
    captureTopRegion: imageComparison.captureTopRegion,
    // New: Image comparison functions for scroll bottom detection
    compareBottomRegions: imageComparison.compareBottomRegions,
    captureBottomRegion: imageComparison.captureBottomRegion,
    // Connection health and reconnection
    updateDetectionTime: updateDetectionTime,
    checkConnectionHealth: checkConnectionHealth,
    attemptReconnection: attemptReconnection,
  };

  if (isRunning) {
    console.log('DEBUG: Activating iPhone Mirroring app.');
    await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Short delay after activation
    
    // Reset custom trigger state for new level
    finishBuildAutomation.resetCustomTriggerState();
    
    await finishLevelAutomation.startAutomation(automationDependencies);
  } else {
    await finishLevelAutomation.stopAutomation(automationDependencies);
  }
});

ipcMain.handle('pause-automation-on-mouse-move', async () => {
  // Only pause if any relevant automation is running
  if (!isAutomationRunning && !isFinishLevelRunning && !isClickAroundRunning) {
    return; 
  }

  // Handle Click Around pausing
  if (isClickAroundRunning && !isClickAroundPaused) {
    isClickAroundPaused = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Paused: Mouse moved (Click Around - resuming in 10s)...', 'warning');
    }
    // Clear any existing pause timeout to restart the countdown
    if (pauseTimeout) {
      clearTimeout(pauseTimeout);
    }
    pauseTimeout = setTimeout(() => {
      isClickAroundPaused = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('finish-build-status', 'Resuming Click Around automation...', 'info');
      }
      pauseTimeout = null;
    }, 10000); // 10 seconds for Click Around
    return;
  }

  if (!isAutomationRunning) { // Only pause if Finish Build automation is actually running
    return;
  }

  isAutomationRunning = false; // Temporarily stop the loop in finishBuild.js

  // If we were holding a click, explicitly release it
  if (isHoldingBlueBox && lastBlueBoxClickCoords) {
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before clickUp
    await clickUp(lastBlueBoxClickCoords.x, lastBlueBoxClickCoords.y);
    isHoldingBlueBox = false; // Update state in main process
  }

  // Reset automation state in finishBuild.js on pause
  finishBuildAutomation.resetAutomationState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('finish-build-status', 'Paused: Mouse moved (resuming in 5s)...', 'warning');
  }

  // Clear any existing pause timeout to restart the 5-second countdown
  if (pauseTimeout) {
    clearTimeout(pauseTimeout);
  }
  pauseTimeout = setTimeout(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Resuming automation...', 'info');
    }
    // Blue box re-detection is now handled by finishBuild.js when !blueBoxCoords or !lastBlueBoxFound
    // lastBlueBoxClickCoords is not reset here to allow finishBuild.js to use its own blueBoxCoords

    isAutomationRunning = true; // Set to true BEFORE calling startFinishBuildAutomationLoop
    await startFinishBuildAutomationLoop();
    pauseTimeout = null;
  }, 5000); // Pause for 5 seconds

  return { success: true, message: 'Automation paused.' };
});

ipcMain.handle('simulate-click', async (event, x, y) => {
  return performClick(x, y);
});

ipcMain.handle('activate-iphone-mirroring', async () => {
  await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
  await new Promise(resolve => setTimeout(resolve, 100)); // Short delay after activation
  return { success: true };
});

ipcMain.handle('scroll-down', async (event, x, y, distance) => {
  // Broadcast scroll event for overlay clearing
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scroll-occurred');
  }
  return scrollingFunctions.scrollDown(x, y, distance);
});

ipcMain.handle('scroll-up', async (event, x, y) => {
  // Broadcast scroll event for overlay clearing
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scroll-occurred');
  }
  // Pass dependencies to scrollUp function
  return scrollingFunctions.scrollUp(x, y, { updateCurrentFunction, CLICK_AREAS, performClick, getRandomInt: scrollingFunctions.getRandomInt });
});

ipcMain.handle('scroll-to-bottom', async (event, x, y, distance, count) => {
  // Broadcast scroll event for overlay clearing
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scroll-occurred');
  }
  // Pass dependencies to scrollToBottom function
  return scrollingFunctions.scrollToBottom(x, y, distance, count, { updateCurrentFunction, scrollDown: scrollingFunctions.scrollDown, performClick, CLICK_AREAS });
});

ipcMain.handle('scroll-to-top', async () => {
  // Broadcast scroll event for overlay clearing
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scroll-occurred');
  }
  return scrollingFunctions.scrollToTop({ updateCurrentFunction, performClick, CLICK_AREAS });
});

ipcMain.handle('toggle-click-around', async (event, isRunning, exclude_red_blobs = true) => {
  // Prevent starting if another automation is already running
  if (isRunning && (isAutomationRunning || isFinishLevelRunning)) {
    console.log('ERROR: Finish Build or Finish Level automation is already running. Cannot start Click Around.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Finish Build or Finish Level already running. Cannot start Click Around.', 'error');
    }
    return;
  }

  isClickAroundRunning = isRunning;
  if (isRunning) {
    updateCurrentFunction('toggle-click-around');
    if (mainWindow && !mainWindow.isDestroyed()) {
      const blobStatus = exclude_red_blobs ? 'excluding red blobs' : 'including red blobs';
      mainWindow.webContents.send('finish-build-status', `Starting Click Around automation (${blobStatus})...`, 'info');
    }
    const clickAroundDependencies = {
      updateStatus: (message, type) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          statusMessageHistory.push({ message, type, timestamp: new Date().toLocaleTimeString() });
          if (statusMessageHistory.length > STATUS_MESSAGE_LIMIT) {
            statusMessageHistory.shift();
          }
          mainWindow.webContents.send('finish-build-status', message, type);
          mainWindow.webContents.send('finish-build-status-list', statusMessageHistory);
        }
      },
      detectRedBlobs: redBlobDetector.detect,
      performClick: performClick,
      performBatchedClicks: performBatchedClicks, // New: For optimized clickAround
      iphoneMirroringRegion: iphoneMirroringRegion,
      updateCurrentFunction: updateCurrentFunction,
      CLICK_AREAS: CLICK_AREAS,
      getIsClickAroundRunning: () => isClickAroundRunning,
      getIsClickAroundPaused: () => isClickAroundPaused,
      captureScreenRegion: captureScreenRegion,
    };
    clickAroundFunctions.clickAround(clickAroundDependencies, exclude_red_blobs).then(() => {
      // Click around function completed naturally
      isClickAroundRunning = false;
      updateCurrentFunction('Idle');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('finish-build-status', 'Click Around automation completed.', 'success');
        mainWindow.webContents.send('click-around-stopped');
      }
    }).catch((error) => {
      // Click around function encountered an error
      isClickAroundRunning = false;
      updateCurrentFunction('Idle');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('finish-build-status', `Click Around automation error: ${error.message}`, 'error');
        mainWindow.webContents.send('click-around-stopped');
      }
    });
  } else {
    updateCurrentFunction('Idle');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Stopping Click Around automation...', 'info');
      mainWindow.webContents.send('click-around-stopped');
    }
  }
  return { success: true };
});

// Helper function to start the capture interval
async function startCaptureInterval(interval = 500) {
  if (isCapturing) return false;

  isCapturing = true;
  captureInterval = setInterval(async () => {
    try {
      if (!isCapturing || !mainWindow || mainWindow.isDestroyed()) {
        clearInterval(captureInterval);
        captureInterval = null;
        isCapturing = false;
        return;
      }
      
      const dataUrl = await captureScreenRegion();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('live-view-update', dataUrl);
      }
    } catch (error) {
      console.error('Live view capture error:', error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('live-view-error', error.message);
      }
    }
  }, interval);
  
  return true;
}

ipcMain.handle('start-live-view', async (event, interval = 500) => {
  return startCaptureInterval(interval);
});

ipcMain.handle('stop-live-view', async () => {
  isCapturing = false;
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  return true;
});

// New scrolling test IPC handlers
ipcMain.handle('scroll-new-up-test', async () => {
  const scrollNewTest = require('./src/automation/scrollNewTest');
  return await scrollNewTest.scrollNewUpTest({
    captureScreenRegion: captureScreenRegion,
    iphoneMirroringRegion: iphoneMirroringRegion
  });
});

ipcMain.handle('scroll-new-down-test', async () => {
  const scrollNewTest = require('./src/automation/scrollNewTest');
  return await scrollNewTest.scrollNewDownTest({
    captureScreenRegion: captureScreenRegion,
    iphoneMirroringRegion: iphoneMirroringRegion
  });
});
}

// Global shortcuts
app.whenReady().then(() => {
  createWindow();
  
  // Set up IPC handlers after app is ready
  setupIpcHandlers();
  
  // Live view is now disabled by default - user must manually start it
  mainWindow.webContents.on('did-finish-load', async () => {
    // await startCaptureInterval(); // Disabled - user must manually start live view
    updateCurrentLevelDuration(0); // Initialize current level duration display
    updatePreviousLevelDuration(null); // Initialize previous level duration display
    updateLongestLevelDuration(null); // New: Initialize longest level duration display
    updateShortestLevelDuration(null); // New: Initialize shortest level duration display
    updateLevelsFinishedCount(0); // New: Initialize levels finished count
    updateAverageLevelDuration(null); // New: Initialize average level duration
    updateCurrentLevelName(''); // Initialize current level name as empty (unnamed)
    resetClickAroundCallCounter(); // Reset clickAround counter on app start
    
    // Send initial daily stats to renderer
    try {
      const todayStats = dailyStats.getTodayStats();
      mainWindow.webContents.send('update-daily-stats', todayStats);
    } catch (error) {
      console.error('Error loading daily stats on startup:', error);
    }
  });
  
  // Register global shortcuts
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // This shortcut is currently not used but can be re-purposed
    }
  });
  
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shortcut-stop'); // Not directly stopping here, but can signal renderer
    }
  });

  // App event handlers
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (captureInterval) {
      clearInterval(captureInterval);
    }
  });
});
