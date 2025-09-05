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
let currentLevelStartTime = null; // New: To track the start time of the current level
let previousLevelDurationMs = null; // New: To store the duration of the previous level
let longestLevelDurationMs = null; // New: To store the longest level duration
let shortestLevelDurationMs = null; // New: To store the shortest level duration
let levelsFinishedCount = 0; // New: To track the number of levels finished
let totalLevelsDurationMs = 0; // New: To accumulate total duration for average calculation

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

// New functions for click and hold using cliclick
async function clickDown(x, y) {
  try {
    console.log(`Attempting cliclick down at (${x}, ${y}).`);
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before cliclick
    const { stdout, stderr } = await execAsync(`cliclick dd:${x},${y}`); // 'dd' for drag down (mouse button down)
    if (stderr) {
      console.error(`cliclick dd stderr: ${stderr}`);
    }
    console.log(`cliclick dd stdout: ${stdout}`);
    console.log(`Successfully attempted cliclick down at: (${x}, ${y})`);
    return { success: true };
  } catch (error) {
    console.error(`Error cliclick down at (${x}, ${y}):`, error);
    return { success: false, error: error.message };
  }
}

async function clickUp(x, y) {
  try {
    console.log(`Attempting cliclick up at (${x}, ${y}).`);
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before cliclick
    const { stdout, stderr } = await execAsync(`cliclick du:${x},${y}`); // 'du' for drag up (mouse button up)
    if (stderr) {
      console.error(`cliclick du stderr: ${stderr}`);
    }
    console.log(`cliclick du stdout: ${stdout}`);
    console.log(`Successfully attempted cliclick up at: (${x}, ${y})`);
    return { success: true };
  } catch (error) {
    console.error(`Error cliclick up at (${x}, ${y}):`, error);
    return { success: false, error: error.message };
  }
}

async function clickAndHold(x, y, duration, getIsAutomationRunning) {
  console.log(`DEBUG: Clicking and holding at (${x}, ${y}) for ${duration}ms.`);
  const resultDown = await clickDown(x, y);
  if (!resultDown.success) return resultDown;

  const startTime = Date.now();
  let heldDuration = 0;
  const checkInterval = 100; // Check every 100ms

  while (heldDuration < duration && getIsAutomationRunning()) {
    await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, duration - heldDuration)));
    heldDuration = Date.now() - startTime;
  }

  // Only click up if automation is still running or if we specifically stopped during the hold
  if (getIsAutomationRunning() || heldDuration >= duration) {
    const resultUp = await clickUp(x, y);
    return resultUp;
  } else {
    // Automation was stopped during the hold, just ensure click is released
    const resultUp = await clickUp(x, y);
    return resultUp;
  }
}

async function performRapidClicks(x, y, count) {
  console.log(`Performing ${count} rapid clicks at (${x}, ${y}).`);
  // Commenting out the original loop
  // for (let i = 0; i < count; i++) {
  //   await performClick(x, y);
  //   await new Promise(resolve => setTimeout(resolve, 5)); // Changed delay between rapid clicks to 5ms
  // }
  // await new Promise(resolve => setTimeout(resolve, 200)); // Added 200ms delay after the 10th click

  // Construct a single cliclick command for rapid sequential clicks with a 100ms wait
  const clickCommands = [];
  for (let i = 0; i < count; i++) {
    clickCommands.push(`c:${x},${y}`);
    if (i < count - 1) {
      clickCommands.push(`w:1`); // 1ms wait between clicks
    }
  }
  const fullCommand = `cliclick ${clickCommands.join(' ')}`;

  try {
    console.log(`Executing rapid clicks via cliclick: ${fullCommand}`);
    const { stdout, stderr } = await execAsync(fullCommand);
    if (stderr) {
      console.error(`cliclick rapid clicks stderr: ${stderr}`);
    }
    console.log(`cliclick rapid clicks stdout: ${stdout}`);
    console.log(`Successfully performed ${count} rapid clicks at: (${x}, ${y})`);
    return { success: true };
  } catch (error) {
    console.error(`Error performing rapid clicks at (${x}, ${y}):`, error);
    return { success: false, error: error.message };
  }
}

// New function to perform the click, called internally by main process
async function performClick(x, y) {
  try {
    console.log(`Attempting to simulate click at (${x}, ${y}) using cliclick.`);
    // Removed app activation from here, it will be done once at automation start
    // await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
    // No delay needed here as activation is handled at start

    // Use cliclick to perform the click
    const { stdout, stderr } = await execAsync(`cliclick c:${x},${y} w:100`);
    if (stderr) {
      console.error(`cliclick stderr: ${stderr}`);
    }
    console.log(`cliclick stdout: ${stdout}`);
    console.log(`Successfully simulated click at: (${x}, ${y})`);
    return { success: true };
  } catch (error) {
    console.error(`Error simulating click at (${x}, ${y}):`, error);
    return { success: false, error: error.message };
  }
}

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Calculate the desired starting X position, offsetting by 100 pixels
    const startX = Math.round((width - 1200) / 2) + 100; // Center then shift right
    const startY = Math.round((height - 800) / 2); // Center vertically

    console.log(`Creating window at X: ${startX}, Y: ${startY}, Width: 1200, Height: 800`);

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
      console.log('Auto-detected iPhone Mirroring window:', windowInfo);
      return windowInfo;
    }
    
    // If process detection fails, use the default region
    const suggestedWidth = 450;
    const suggestedHeight = 900;
    const x = 0;
    const y = 100;
    
    const suggestedRegion = { x, y, width: suggestedWidth, height: suggestedHeight };
    iphoneMirroringRegion = suggestedRegion;
    console.log('Suggested region based on screen size:', suggestedRegion);
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
    console.log('Attempting red blob detection with region:', iphoneMirroringRegion);
    const fullScreenDataUrl = await captureScreenRegion();
    
    // Log captured image dimensions for debugging
    const imageBuffer = Buffer.from(fullScreenDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const sharpImage = sharp(imageBuffer);
    const metadata = await sharpImage.metadata();
    console.log(`Captured full screen image dimensions: ${metadata.width}x${metadata.height}`);

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
    console.log('Attempting blue box detection with region:', iphoneMirroringRegion);
    const fullScreenDataUrl = await captureScreenRegion();

    // Log captured image dimensions for debugging
    const imageBuffer = Buffer.from(fullScreenDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const sharpImage = sharp(imageBuffer);
    const metadata = await sharpImage.metadata();
    console.log(`Captured full screen image dimensions: ${metadata.width}x${metadata.height}`);
    console.log(`fullScreenDataUrl length: ${fullScreenDataUrl.length}`);
    console.log(`imageBuffer size: ${imageBuffer.byteLength} bytes`);
    console.log(`iPhone Mirroring Region: ${JSON.stringify(iphoneMirroringRegion)}`);

    const detections = await blueBoxDetector.detect(fullScreenDataUrl, iphoneMirroringRegion);
    console.log(`DEBUG: Blue box detection result for UI: ${JSON.stringify(detections)}`);
    return { success: true, detections };
  } catch (error) {
    console.error('Error detecting blue boxes:', error);
    return { success: false, error: error.message };
  }
});

// Function to start the Finish Build automation loop
async function startFinishBuildAutomationLoop() {
  console.log('Starting Finish Build automation loop internally.');
  updateCurrentFunction('startFinishBuildAutomationLoop'); // Update current function
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('finish-build-status', 'Starting automation loop...', 'info');
  }

  // Dependencies for the automation protocol
  const automationDependencies = {
    performClick,
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
  };

  // Start the automation loop in finishBuild.js
  finishBuildAutomation.runBuildProtocol(automationDependencies);
}

ipcMain.handle('toggle-finish-build', async (event, isRunning) => {
  console.log(`DEBUG: toggle-finish-build IPC handler called with isRunning: ${isRunning}`);

  if (isRunning) {
    updateCurrentFunction('toggle-finish-build'); // Update current function
    isAutomationRunning = isRunning; // Update the global flag
    console.log('DEBUG: Starting Finish Build automation via IPC.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Starting Finish Build automation...', 'info');
    }
    // Bring the iPhone Mirroring app to the front once at the start of automation
    await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Short delay after activation

    startFinishBuildAutomationLoop();
  } else {
    isAutomationRunning = isRunning; // Update the global flag to false
    console.log('DEBUG: Stopping Finish Build automation via IPC.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Stopping Finish Build automation...', 'info');
    }
    if (pauseTimeout) {
      clearTimeout(pauseTimeout);
      pauseTimeout = null;
      console.log('DEBUG: pauseTimeout cleared during stop.');
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
  console.log(`DEBUG: toggle-finish-level IPC handler called with isRunning: ${isRunning}, scrollSwipeDistance: ${scrollSwipeDistance}, scrollToBottomIterations: ${scrollToBottomIterations}, scrollUpAttempts: ${scrollUpAttempts}`);
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
    getIsAutomationRunning: () => isFinishLevelRunning, // Use its own state for finish level
    setIsAutomationRunning: (state) => { isFinishLevelRunning = state; }, // Pass setter for automation running state
    finishBuildAutomationRunBuildProtocol: finishBuildAutomation.runBuildProtocol, // Pass the runBuildProtocol from finishBuildAutomation
    scrollDown: scrollDown, // New: Pass scrollDown function
    scrollUp: scrollUp,     // New: Pass scrollUp function
    scrollToBottom: scrollToBottom, // New: Pass scrollToBottom function
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
        updateAverageLevelDuration(totalLevelsDurationMs / levelsFinishedCount); // Update display
        currentLevelStartTime = Date.now(); // Reset current level timer
    },
    updateLongestLevelDuration: updateLongestLevelDuration, // New: Pass new function
    updateShortestLevelDuration: updateShortestLevelDuration, // New: Pass new function
    updateLevelsFinishedCount: updateLevelsFinishedCount, // New: Pass new function
    updateAverageLevelDuration: updateAverageLevelDuration, // New: Pass new function
    currentLevelStartTime: currentLevelStartTime, // Pass the current level start time
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
  console.log(`DEBUG: Mouse movement detected. Current state: isAutomationRunning: ${isAutomationRunning}, isFinishLevelRunning: ${isFinishLevelRunning}, pauseTimeout: ${!!pauseTimeout}, isHoldingBlueBox: ${isHoldingBlueBox}`);

  // If Finish Level automation is running, do not pause it on mouse move.
  // Instead, only consider pausing Finish Build automation.
  if (isFinishLevelRunning && !isAutomationRunning) {
    console.log('DEBUG: Finish Level automation is running and Finish Build is not. Ignoring mouse move for pausing Finish Level.');
    return; 
  }
  
  if (!isAutomationRunning) { // Only pause if Finish Build automation is actually running
    console.log('DEBUG: Finish Build automation not running, ignoring mouse move.');
    return;
  }

  isAutomationRunning = false; // Temporarily stop the loop in finishBuild.js
  console.log('DEBUG: Finish Build automation loop in finishBuild.js will stop.');

  // If we were holding a click, explicitly release it
  if (isHoldingBlueBox && lastBlueBoxClickCoords) {
    console.log(`DEBUG: Attempting to release click-hold on mouse move at (${lastBlueBoxClickCoords.x}, ${lastBlueBoxClickCoords.y}).`);
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before clickUp
    await clickUp(lastBlueBoxClickCoords.x, lastBlueBoxClickCoords.y);
    isHoldingBlueBox = false; // Update state in main process
    console.log('DEBUG: Click-hold released on mouse move.');
  }

  // Reset automation state in finishBuild.js on pause
  finishBuildAutomation.resetAutomationState();
  console.log('Finish Build automation paused due to mouse movement.');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('finish-build-status', 'Paused: Mouse moved (resuming in 5s)...', 'warning');
  }

  // Clear any existing pause timeout to restart the 5-second countdown
  if (pauseTimeout) {
    clearTimeout(pauseTimeout);
    console.log('DEBUG: Existing pauseTimeout cleared. Restarting pause timer.');
  }
  console.log('DEBUG: Setting pauseTimeout for 5 seconds.');
  pauseTimeout = setTimeout(async () => {
    console.log('Resuming Finish Build automation after pause.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('finish-build-status', 'Resuming automation...', 'info');
    }
    // Blue box re-detection is now handled by finishBuild.js when !blueBoxCoords or !lastBlueBoxFound
    // lastBlueBoxClickCoords is not reset here to allow finishBuild.js to use its own blueBoxCoords

    isAutomationRunning = true; // Set to true BEFORE calling startFinishBuildAutomationLoop
    await startFinishBuildAutomationLoop();
    pauseTimeout = null;
    console.log('DEBUG: pauseTimeout nulled after resume.');
  }, 5000); // Pause for 5 seconds

  return { success: true, message: 'Automation paused.' };
});

ipcMain.handle('simulate-click', async (event, x, y) => {
  return performClick(x, y);
});

ipcMain.handle('activate-iphone-mirroring', async () => {
  console.log('DEBUG: Activating iPhone Mirroring app via IPC.');
  await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
  await new Promise(resolve => setTimeout(resolve, 100)); // Short delay after activation
  return { success: true };
});

ipcMain.handle('scroll-down', async (event, x, y, distance) => {
  return scrollDown(x, y, distance);
});

ipcMain.handle('scroll-up', async (event, x, y, distance) => {
  return scrollUp(x, y, distance);
});

ipcMain.handle('scroll-to-bottom', async (event, x, y, distance, count) => {
  return scrollToBottom(x, y, distance, count);
});

// New functions for scrolling vertically
async function scrollDown(x, y, distance) {
  updateCurrentFunction('scrollDown'); // Update current function
  console.log(`Attempting smooth click-drag down from (${x}, ${y}) by ${distance} pixels using RobotJS.`);
  try {
    // 1. Move mouse to start point
    robot.moveMouse(x, y);
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // 2. Press and hold left mouse button
    robot.mouseToggle('down', 'left');
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // 3. Drag mouse to end point
    robot.dragMouse(x, y - distance); // Drag upwards to scroll down
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // 4. Release left mouse button
    robot.mouseToggle('up', 'left');
    console.log(`Successfully performed smooth click-drag down from (${x}, ${y}) by ${distance} pixels.`);
    return { success: true };
  } catch (error) {
    console.error(`Error executing RobotJS scroll down: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function scrollUp(x, y, distance) {
  updateCurrentFunction('scrollUp'); // Update current function
  console.log(`Attempting smooth click-drag up from (${x}, ${y}) by ${distance} pixels using RobotJS.`);
  try {
    // 1. Move mouse to start point
    robot.moveMouse(x, y);
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // 2. Press and hold left mouse button
    robot.mouseToggle('down', 'left');
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // 3. Drag mouse to end point
    robot.dragMouse(x, y + distance); // Drag downwards to scroll up
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // 4. Release left mouse button
    robot.mouseToggle('up', 'left');
    console.log(`Successfully performed smooth click-drag up from (${x}, ${y}) by ${distance} pixels.`);
    return { success: true };
  } catch (error) {
    console.error(`Error executing RobotJS scroll up: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function scrollToBottom(x, y, distance, count) {
  updateCurrentFunction('scrollToBottom'); // Update current function
  console.log(`Attempting to scroll to bottom at (${x}, ${y}).`);
  for (let i = 0; i < count; i++) { // Use configurable count
    await scrollDown(x, y, distance);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between scrolls
  }
  console.log(`Successfully scrolled to bottom at (${x}, ${y}).`);
  return { success: true };
}

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

// Global shortcuts
app.whenReady().then(() => {
  createWindow();
  
  // Auto-start live view when the window is ready
  mainWindow.webContents.on('did-finish-load', async () => {
    await startCaptureInterval();
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
});
