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
const levelDatabase = require('./lib/levelDatabase');

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
let currentLevelStartTime = null; // New: To track the start time of the current level
let currentLevelName = 'Unknown Level'; // New: To track the current level name
let finishedLevelName = ''; // New: Track the name of the level that just finished
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
let totalStagesDurationMs = 0; // Total duration of all completed stages
let levelToStageId = new Map(); // Map level names to stage IDs to prevent cross-contamination

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
            const levelBest = historicalStats.getLevelBest(levelForAverage);
            const levelLast = historicalStats.getLevelLast(levelForAverage);
            console.log(`DEBUG: Sending level average for "${levelForAverage}" (current: "${currentLevelName}", finished: "${finishedLevelName}")`);
            mainWindow.webContents.send('update-current-level-name', currentLevelName, levelAverage, levelBest, levelLast);
        }
        return;
    }
    
    // Don't auto-store level names here - let the exit process handle it
    
    // Check if this level starts a new stage
    if (statistics.isStageStart(originalLevelName)) {
        const stageCityName = statistics.getStageCity(originalLevelName);
        console.log(`DEBUG: New stage detected: "${stageCityName}"`);
        
        // Complete current stage if one exists
        if (currentStage && stageTrackingEnabled) {
            completeCurrentStage();
        }
        
        // Start new stage
        startNewStage(stageCityName);
        
        // Get the proper first level name from the database (use 'name', not 'originalName')
        const stageInfo = levelDatabase.getStageByCity(stageCityName);
        if (stageInfo && stageInfo.levels[0] && stageInfo.levels[0].name) {
            currentLevelName = stageInfo.levels[0].name; // This will be "Level 1"
            console.log(`DEBUG: Stage start level renamed from "${originalLevelName}" to "${currentLevelName}" (proper first level name)`);
        } else {
            // Fallback to "Level 1" if database lookup fails
            currentLevelName = 'Level 1';
            console.log(`DEBUG: Stage start level renamed from "${originalLevelName}" to "Level 1" (database lookup failed)`);
        }
    } else {
        // Regular level - keep original name and increment counter for new levels
        currentLevelName = originalLevelName;
        console.log(`DEBUG: Regular level name set: "${currentLevelName}"`);
        
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
        const levelBest = historicalStats.getLevelBest(currentLevelName);
        const levelLast = historicalStats.getLevelLast(currentLevelName);
        mainWindow.webContents.send('update-current-level-name', currentLevelName, levelAverage, levelBest, levelLast);
        // Also send stage info for enhanced UI
        sendStageInfoToRenderer();
    }
}

function setFinishedLevelName(levelName) {
    finishedLevelName = levelName || '';
    console.log(`DEBUG: Finished level name set to: "${finishedLevelName}"`);
}

// Stage management functions
function startNewStage(stageCityName) {
    const now = Date.now();
    
    // Force complete the previous stage if it exists (to prevent cross-contamination)
    if (currentStage && stageTrackingEnabled) {
        console.log(`DEBUG: Force completing previous stage "${currentStage.name}" before starting "${stageCityName}"`);
        completeCurrentStage();
        
        // DON'T clear level mappings - let pending levels complete to their correct stages
        console.log(`DEBUG: Keeping ${levelToStageId.size} pending level mappings to allow proper completion`);
    }
    
    currentStage = {
        name: stageCityName,
        startTime: now,
        levels: [],
        id: now // Unique ID for this stage
    };
    
    currentStageLevel = 1; // First level of the stage
    stageTrackingEnabled = true; // Enable tracking for this fresh stage
    
    console.log(`DEBUG: Started new stage: "${stageCityName}"`);
}

function completeCurrentStage() {
    if (!currentStage) return;
    
    // Prevent duplicate completion
    if (currentStage.completed) {
        console.log(`DEBUG: Stage "${currentStage.name}" already completed - skipping duplicate completion`);
        return;
    }
    
    const now = Date.now();
    const stageDurationMs = now - currentStage.startTime;
    
    // Mark as completed to prevent duplicates
    currentStage.completed = true;
    
    // Complete the stage
    const completedStage = {
        ...currentStage,
        endTime: now,
        durationMs: stageDurationMs,
        levelCount: currentStage.levels.length
    };
    
    // Record stage completion in historical stats
    historicalStats.recordStageCompletion(completedStage.name, stageDurationMs);
    
    // Update statistics
    previousStage = completedStage;
    completedStagesCount++;
    totalStagesDurationMs += stageDurationMs;
    
    // Update longest/shortest stages
    updateStageRecords(completedStage);
    
    console.log(`DEBUG: Completed stage: "${completedStage.name}" (${stageDurationMs}ms, ${completedStage.levelCount} levels)`);
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

function addLevelToCurrentStage(levelName, durationMs) {
    if (!currentStage || !stageTrackingEnabled) return;
    
    // Check for duplicates - don't add the same level twice
    const isDuplicate = currentStage.levels.some(level => level.name === levelName);
    if (isDuplicate) {
        console.log(`DEBUG: Skipping duplicate level "${levelName}" in stage "${currentStage.name}"`);
        return;
    }
    
    // Record level completion in historical stats
    if (levelName && levelName !== 'Unknown Level' && levelName !== 'Unnamed Level') {
        historicalStats.recordLevelCompletion(levelName, durationMs);
    }
    
    const levelInfo = {
        name: levelName,
        durationMs: durationMs,
        completedAt: Date.now()
    };
    
    currentStage.levels.push(levelInfo);
    
    // Note: currentStageLevel is incremented when new levels start, not when they complete
    
    // Check if stage is complete (6 or 7 levels depending on whether stage has N/A)
    // Get expected level count for this stage
    const stageInfo = levelDatabase.getStageByCity(currentStage.name);
    const expectedLevelCount = stageInfo ? stageInfo.levels.filter(l => l.name !== 'N/A').length : 7;
    
    console.log(`DEBUG: Added level to stage "${currentStage.name}": "${levelName}" (${durationMs}ms) - Stage progress: ${currentStage.levels.length}/${expectedLevelCount}`);
    console.log(`DEBUG: Current stage levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
    
    if (currentStage.levels.length >= expectedLevelCount) {
        console.log(`DEBUG: Stage "${currentStage.name}" complete with ${currentStage.levels.length}/${expectedLevelCount} levels - moving to previous`);
        completeCurrentStage();
        currentStage = null;
        currentStageLevel = 0;
    }
}

function addLevelToCurrentStageIfValid(levelName, durationMs) {
    if (!stageTrackingEnabled) return;
    
    // Check if this level was mapped to a specific stage ID
    const mappedStageId = levelToStageId.get(levelName);
    
    if (mappedStageId) {
        // Check if it belongs to the current stage
        if (currentStage && mappedStageId === currentStage.id) {
            console.log(`DEBUG: Adding level "${levelName}" to current stage "${currentStage.name}"`);
            addLevelToCurrentStage(levelName, durationMs);
            // Clean up the mapping
            levelToStageId.delete(levelName);
            // Send updated info to renderer
            sendStageInfoToRenderer();
        } 
        // Check if it belongs to the previous stage (recently completed)
        else if (previousStage && mappedStageId === previousStage.id) {
            console.log(`DEBUG: Adding level "${levelName}" to previous stage "${previousStage.name}" (late completion)`);
            
            // Record level completion in historical stats
            if (levelName && levelName !== 'Unknown Level' && levelName !== 'Unnamed Level') {
                historicalStats.recordLevelCompletion(levelName, durationMs);
            }
            
            // Add to previous stage's levels array
            previousStage.levels.push({
                name: levelName,
                durationMs: durationMs,
                completedAt: Date.now()
            });
            console.log(`DEBUG: Previous stage "${previousStage.name}" now has ${previousStage.levels.length} levels`);
            // Clean up the mapping
            levelToStageId.delete(levelName);
            // Send updated info to renderer
            sendStageInfoToRenderer();
        }
        else {
            console.log(`DEBUG: Skipping level "${levelName}" - belongs to unknown stage (ID: ${mappedStageId})`);
            // Clean up stale mapping
            levelToStageId.delete(levelName);
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
            historicalAverage: historicalStats.getStageAverage(currentStage.name),
            historicalBest: historicalStats.getStageBest(currentStage.name)
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
    
    // Check if this is a duplicate of the last sent stage info
    const stageInfoString = JSON.stringify(stageInfo);
    if (lastStageInfoSent === stageInfoString) {
        console.log(`DEBUG: Skipping duplicate stage info send`);
        return;
    }
    lastStageInfoSent = stageInfoString;
    
    // Debug logging for stage level counts
    if (currentStage) {
        console.log(`DEBUG: Sending stage info - Current stage "${currentStage.name}" has ${currentStage.levels.length} levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
    }
    if (previousStage) {
        console.log(`DEBUG: Sending stage info - Previous stage "${previousStage.name}" has ${previousStage.levels.length} levels: [${previousStage.levels.map(l => l.name).join(', ')}]`);
    }
    
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
ipcMain.handle('get-historical-stats', async () => {
  return historicalStats.loadStats();
});

ipcMain.handle('get-level-database', async () => {
  return levelDatabase.LEVEL_DATABASE;
});

ipcMain.handle('get-level-average', async (event, levelName) => {
  return historicalStats.getLevelAverage(levelName);
});

// Settings IPC handlers
const settingsManager = require('./lib/settingsManager');

ipcMain.handle('get-all-level-names', async () => {
  return settingsManager.getAllLevelNames();
});

ipcMain.handle('get-level-settings', async (event, levelName) => {
  return settingsManager.getLevelSettings(levelName);
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
    
    // Clear level name and overlays at start of finish level automation
    updateCurrentLevelName(''); // Set to empty string for unnamed level
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('clear-overlays');
    }
    
    updateCurrentFunction('toggle-finish-level'); // Update current function
    currentLevelStartTime = Date.now(); // Start timer for current level
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
    updatePreviousLevelDuration: (duration) => {
        previousLevelDurationMs = duration;
        
        // Only track statistics for named levels (exclude "Unknown Level" and empty strings)
        if (finishedLevelName && finishedLevelName.trim() !== '' && finishedLevelName !== 'Unknown Level') {
            levelsFinishedCount++; // Increment count of finished levels
            totalLevelsDurationMs += duration; // Add to total duration

            // Record level completion in historical stats (fallback if not recorded through stage tracking)
            historicalStats.recordLevelCompletion(finishedLevelName, duration);
            console.log(`DEBUG: Recorded level completion: "${finishedLevelName}" (${duration}ms)`);

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
            addLevelToCurrentStageIfValid(finishedLevelName, duration);
        }

        // Always update the previous level duration display (for unnamed levels too)
        updatePreviousLevelDuration(duration);
        currentLevelStartTime = Date.now(); // Reset current level timer
        
        // Note: sendStageInfoToRenderer() is already called by updateCurrentLevelName() above
    },
    // New: Pass a getter function for the current level start time
    getCurrentLevelStartTime: () => currentLevelStartTime,
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
  };

  if (isRunning) {
    console.log('DEBUG: Activating iPhone Mirroring app.');
    await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Short delay after activation
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
