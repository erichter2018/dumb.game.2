const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer } = require('electron');
const path = require('path');
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
const scrollingFunctions = require('./src/automation/scrolling');
const clickAroundFunctions = require('./src/automation/clickAround');

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
let currentLevelStartTime = null; // New: To track the start time of the current level
let previousLevelDurationMs = null; // New: To store the duration of the previous level
let longestLevelDurationMs = null; // New: To store the longest level duration
let shortestLevelDurationMs = null; // New: To store the shortest level duration
let levelsFinishedCount = 0; // New: To track the number of levels finished
let totalLevelsDurationMs = 0; // New: To accumulate total duration for average calculation

// Global Pause System - Mouse Movement Detection
let isGloballyPaused = false; // Master pause flag
let lastMousePos = { x: 0, y: 0 }; // Track mouse position
let lastMouseMovementTime = 0; // Track when mouse last moved
let mouseMovementThreshold = 25; // Minimum pixels to trigger pause (increased from 5 to reduce false triggers)
let mouseIdleTime = 3000; // Milliseconds of no movement to resume (3 seconds, increased for stability)
let globalMouseMonitor = null; // Interval for mouse monitoring
let pauseEnabled = true; // Allow disabling the pause system
let lastPauseTime = 0; // Track when we last paused to prevent rapid pause/resume cycles
let minPauseDuration = 1000; // Minimum time to stay paused (1 second)

// Function to send current active function to renderer
function updateCurrentFunction(functionName) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-current-function', functionName);
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

// Global Mouse Movement Pause System
function startGlobalMouseMonitoring() {
    if (globalMouseMonitor || !pauseEnabled) return;
    
    // Initialize mouse position
    try {
        lastMousePos = robot.getMousePos();
    } catch (error) {
        console.error('Failed to initialize mouse position:', error);
        return;
    }
    
    console.log('DEBUG: Starting global mouse movement monitoring');
    
    globalMouseMonitor = setInterval(() => {
        try {
            const currentPos = robot.getMousePos();
            const distance = Math.sqrt(
                Math.pow(currentPos.x - lastMousePos.x, 2) + 
                Math.pow(currentPos.y - lastMousePos.y, 2)
            );
            
            if (distance > mouseMovementThreshold) {
                if (!isGloballyPaused) {
                    console.log(`DEBUG: Mouse movement detected (${distance.toFixed(1)}px) - pausing automation`);
                    isGloballyPaused = true;
                    lastPauseTime = Date.now();
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('finish-build-status', 'Automation paused due to mouse movement', 'warning');
                    }
                }
                lastMouseMovementTime = Date.now();
            } else if (isGloballyPaused && Date.now() - lastMouseMovementTime > mouseIdleTime) {
                // Only resume if we've been paused for at least minPauseDuration
                const timeSincePause = Date.now() - lastPauseTime;
                if (timeSincePause >= minPauseDuration) {
                    console.log(`DEBUG: Mouse idle - resuming automation (paused for ${timeSincePause}ms)`);
                    isGloballyPaused = false;
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('finish-build-status', 'Automation resumed', 'success');
                    }
                }
            }
            
            lastMousePos = currentPos;
        } catch (error) {
            console.error('Error in global mouse monitoring:', error);
        }
    }, 100); // Check every 100ms
}

function stopGlobalMouseMonitoring() {
    if (globalMouseMonitor) {
        clearInterval(globalMouseMonitor);
        globalMouseMonitor = null;
        console.log('DEBUG: Stopped global mouse movement monitoring');
    }
}

function setGlobalPauseEnabled(enabled) {
    pauseEnabled = enabled;
    if (enabled) {
        startGlobalMouseMonitoring();
    } else {
        stopGlobalMouseMonitoring();
        isGloballyPaused = false; // Resume if disabled
    }
    console.log(`DEBUG: Global pause system ${enabled ? 'enabled' : 'disabled'}`);
}

// RobotJS Interception for Global Pause
const originalRobotFunctions = {
    moveMouse: robot.moveMouse,
    mouseClick: robot.mouseClick,
    mouseToggle: robot.mouseToggle,
    dragMouse: robot.dragMouse
};

// Wrap robotjs mouse functions to respect global pause
robot.moveMouse = function(x, y) {
    if (isGloballyPaused) {
        // Silently skip mouse movements when paused
        return;
    }
    return originalRobotFunctions.moveMouse.call(this, x, y);
};

robot.mouseClick = function(button, double) {
    if (isGloballyPaused) {
        // Silently skip mouse clicks when paused
        return;
    }
    return originalRobotFunctions.mouseClick.call(this, button, double);
};

robot.mouseToggle = function(down, button) {
    if (isGloballyPaused) {
        // Silently skip mouse toggle when paused
        return;
    }
    return originalRobotFunctions.mouseToggle.call(this, down, button);
};

robot.dragMouse = function(x, y) {
    if (isGloballyPaused) {
        // Silently skip mouse drags when paused
        return;
    }
    return originalRobotFunctions.dragMouse.call(this, x, y);
};

// Define named click areas
const CLICK_AREAS = {
  OPEN_CLOSE_RESEARCH_WINDOW: { x: 403, y: 942 },
  INDIVIDUAL_RESEARCH: { x: 352, y: 456 },
  CLICK_OFF: { x: 33, y: 904 }, // Updated y-coordinate for click-off area
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

    // Calculate the desired starting X position, offsetting by 100 pixels
    const startX = Math.round((width - 1200) / 2) + 100; // Center then shift right
    const startY = Math.round((height - 800) / 2); // Center vertically

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        x: startX,
        y: startY,
        show: true, // Ensure the window is shown
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: path.join(__dirname, 'assets/icon.png'),
        title: 'iPhone Game Automation'
    });

  mainWindow.loadFile('index.html');
  
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

// IPC handlers
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
    performClick,
    performBatchedClicks, // Add missing performBatchedClicks for finishBuild
    clickDown,
    clickUp,
    clickAndHold,
    performRapidClicks,
    CLICK_AREAS,
    redBlobDetectorDetect: redBlobDetector.detect, // Pass detector functions
    detectBlueBoxes: blueBoxDetector.detect, // Corrected dependency name
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
    getlastBlueBoxClickCoords: () => lastBlueBoxClickCoords,
    setlastBlueBoxClickCoords: (coords) => { lastBlueBoxClickCoords = coords; },
    getIsHoldingBlueBox: () => isHoldingBlueBox, // Pass getter for the state
    setIsHoldingBlueBox: (state) => { isHoldingBlueBox = state; }, // Pass setter for the state
    getIsAutomationRunning: () => isAutomationRunning && !isGloballyPaused, // Pass getter for the automation running state (respect global pause)
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
    performClick,
    performBatchedClicks, // Add missing performBatchedClicks for finishLevel
    clickDown,
    clickUp,
    clickAndHold,
    performRapidClicks,
    CLICK_AREAS,
    redBlobDetectorDetect: redBlobDetector.detect,
    detectBlueBoxes: blueBoxDetector.detect,
    captureScreenRegion,
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
    updateCurrentFunction: updateCurrentFunction, // Pass the new function
    iphoneMirroringRegion: iphoneMirroringRegion,
    getlastBlueBoxClickCoords: () => lastBlueBoxClickCoords,
    setlastBlueBoxClickCoords: (coords) => { lastBlueBoxClickCoords = coords; },
    getIsHoldingBlueBox: () => isHoldingBlueBox,
    setIsHoldingBlueBox: (state) => { isHoldingBlueBox = state; },
    getIsAutomationRunning: () => isFinishLevelRunning && !isGloballyPaused, // Use its own state for finish level (respect global pause)
    setIsAutomationRunning: (state) => { isFinishLevelRunning = state; }, // Pass setter for automation running state
    finishBuildAutomationRunBuildProtocol: finishBuildAutomation.runBuildProtocol, // Pass the runBuildProtocol from finishBuildAutomation
    scrollDown: scrollingFunctions.scrollDown, // New: Pass scrollDown function
    scrollUp: scrollingFunctions.scrollUp,     // New: Pass scrollUp function
    scrollToBottom: scrollingFunctions.scrollToBottom, // New: Pass scrollToBottom function
    scrollToTop: scrollingFunctions.scrollToTop, // New: Pass scrollToTop function
    getRandomInt: scrollingFunctions.getRandomInt, // New: Pass getRandomInt function
    scrollSwipeDistance: scrollSwipeDistance, // New: Pass scroll swipe distance
    scrollToBottomIterations: scrollToBottomIterations, // New: Pass scroll to bottom iterations
    scrollUpAttempts: scrollUpAttempts, // New: Pass scroll up attempts
    // New: Functions to handle level duration updates
    updateCurrentLevelDuration: updateCurrentLevelDuration,
    updatePreviousLevelDuration: (duration) => {
        previousLevelDurationMs = duration;
        // Update longest and shortest durations
        if (longestLevelDurationMs === null || duration > longestLevelDurationMs) {
            longestLevelDurationMs = duration;
        }
        if (shortestLevelDurationMs === null || duration < shortestLevelDurationMs) {
            shortestLevelDurationMs = duration;
        }
        levelsFinishedCount++; // Increment count of finished levels
        totalLevelsDurationMs += duration; // Add to total duration

        updatePreviousLevelDuration(duration);
        updateLongestLevelDuration(longestLevelDurationMs); // Update display
        updateShortestLevelDuration(shortestLevelDurationMs); // Update display
        updateLevelsFinishedCount(levelsFinishedCount); // Update display
        updateAverageLevelDuration(levelsFinishedCount > 0 ? totalLevelsDurationMs / levelsFinishedCount : null); // Update display
        currentLevelStartTime = Date.now(); // Reset current level timer
    },
    // New: Pass a getter function for the current level start time
    getCurrentLevelStartTime: () => currentLevelStartTime,
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
  return scrollingFunctions.scrollDown(x, y, distance);
});

ipcMain.handle('scroll-up', async (event, x, y) => {
  // Pass dependencies to scrollUp function
  return scrollingFunctions.scrollUp(x, y, { updateCurrentFunction, CLICK_AREAS, performClick, getRandomInt: scrollingFunctions.getRandomInt });
});

ipcMain.handle('scroll-to-bottom', async (event, x, y, distance, count) => {
  // Pass dependencies to scrollToBottom function
  return scrollingFunctions.scrollToBottom(x, y, distance, count, { updateCurrentFunction, scrollDown: scrollingFunctions.scrollDown, performClick, CLICK_AREAS });
});

ipcMain.handle('scroll-to-top', async () => {
  return scrollingFunctions.scrollToTop({ updateCurrentFunction, performClick, CLICK_AREAS });
});

ipcMain.handle('toggle-click-around', async (event, isRunning) => {
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
      mainWindow.webContents.send('finish-build-status', 'Starting Click Around automation...', 'info');
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
      getIsClickAroundRunning: () => isClickAroundRunning && !isGloballyPaused,
      getIsClickAroundPaused: () => isClickAroundPaused || isGloballyPaused,
      captureScreenRegion: captureScreenRegion,
    };
    clickAroundFunctions.clickAround(clickAroundDependencies, true); // Default to excluding red blobs for manual UI calls
  } else {
    updateCurrentFunction('Idle');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Stopping Click Around automation...', 'info');
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

// Global Pause System IPC Handlers
ipcMain.handle('get-global-pause-settings', async () => {
  return {
    enabled: pauseEnabled,
    mouseThreshold: mouseMovementThreshold,
    idleTime: mouseIdleTime,
    currentlyPaused: isGloballyPaused
  };
});

ipcMain.handle('set-global-pause-settings', async (event, settings) => {
  if (typeof settings.enabled === 'boolean') {
    setGlobalPauseEnabled(settings.enabled);
  }
  if (typeof settings.mouseThreshold === 'number' && settings.mouseThreshold > 0) {
    mouseMovementThreshold = settings.mouseThreshold;
  }
  if (typeof settings.idleTime === 'number' && settings.idleTime > 0) {
    mouseIdleTime = settings.idleTime;
  }
  console.log('DEBUG: Global pause settings updated:', {
    enabled: pauseEnabled,
    mouseThreshold: mouseMovementThreshold,
    idleTime: mouseIdleTime
  });
  return { success: true };
});

ipcMain.handle('force-resume-automation', async () => {
  isGloballyPaused = false;
  lastMouseMovementTime = 0; // Reset movement time to prevent immediate re-pause
  console.log('DEBUG: Automation force-resumed by user');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('finish-build-status', 'Automation force-resumed by user', 'success');
  }
  return { success: true };
});

ipcMain.handle('disable-pause-temporarily', async () => {
  const wasEnabled = pauseEnabled;
  setGlobalPauseEnabled(false);
  console.log('DEBUG: Pause system temporarily disabled');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('finish-build-status', 'Pause system temporarily disabled', 'info');
  }
  return { success: true, wasEnabled };
});

// Global shortcuts
app.whenReady().then(() => {
  createWindow();
  
  // Start global mouse movement monitoring for pause system
  startGlobalMouseMonitoring();
  
  // Live view is now disabled by default - user must manually start it
  mainWindow.webContents.on('did-finish-load', async () => {
    // await startCaptureInterval(); // Disabled - user must manually start live view
    updateCurrentLevelDuration(0); // Initialize current level duration display
    updatePreviousLevelDuration(null); // Initialize previous level duration display
    updateLongestLevelDuration(null); // New: Initialize longest level duration display
    updateShortestLevelDuration(null); // New: Initialize shortest level duration display
    updateLevelsFinishedCount(0); // New: Initialize levels finished count
    updateAverageLevelDuration(null); // New: Initialize average level duration
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
});

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
  // Stop global mouse monitoring
  stopGlobalMouseMonitoring();
});
