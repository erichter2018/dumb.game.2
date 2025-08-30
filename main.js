const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const sharp = require('sharp'); // Import sharp

// Import detector modules
const redBlobDetector = require('./src/detection/redBlobDetector');
const blueBoxDetector = require('./src/detection/blueBoxDetector');
const finishBuildAutomation = require('./src/automation/finishBuild');

let mainWindow;
let isCapturing = false;
let captureInterval;
let lastBlueBoxClickCoords = null; // Store last detected blue box click coordinates
let pauseTimeout = null;
const STATUS_MESSAGE_LIMIT = 5; // Limit to 5 status messages
let statusMessageHistory = []; // Store recent status messages
let isHoldingBlueBox = false; // Add state to track if a blue box is being held
let isAutomationRunning = false; // New flag to control the automation loop in finishBuild.js

// Define named click areas
const CLICK_AREAS = {
  OPEN_CLOSE_RESEARCH_WINDOW: { x: 403, y: 942 },
  INDIVIDUAL_RESEARCH: { x: 352, y: 456 },
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
  for (let i = 0; i < count; i++) {
    await performClick(x, y);
    await new Promise(resolve => setTimeout(resolve, 10)); // Increased delay between rapid clicks
  }
  return { success: true };
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

    const detections = await redBlobDetector.detect(fullScreenDataUrl, iphoneMirroringRegion);
    return { success: true, detections };
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
    return { success: true, detections };
  } catch (error) {
    console.error('Error detecting blue boxes:', error);
    return { success: false, error: error.message };
  }
});

// Function to start the Finish Build automation loop
async function startFinishBuildAutomationLoop() {
  console.log('Starting Finish Build automation loop internally.');
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
    iphoneMirroringRegion: iphoneMirroringRegion, // Pass the current region
    getlastBlueBoxClickCoords: () => lastBlueBoxClickCoords,
    setlastBlueBoxClickCoords: (coords) => { lastBlueBoxClickCoords = coords; },
    getIsHoldingBlueBox: () => isHoldingBlueBox, // Pass getter for the state
    setIsHoldingBlueBox: (state) => { isHoldingBlueBox = state; }, // Pass setter for the state
    getIsAutomationRunning: () => isAutomationRunning, // Pass getter for the automation running state
    // For pausing/resuming based on user input, the main loop manages this part
  };

  // Start the automation loop in finishBuild.js
  finishBuildAutomation.runBuildProtocol(automationDependencies);
}

ipcMain.handle('toggle-finish-build', async (event, isRunning) => {
  console.log(`DEBUG: toggle-finish-build IPC handler called with isRunning: ${isRunning}`);

  if (isRunning) {
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
    });
  }
});

ipcMain.handle('pause-automation-on-mouse-move', async () => {
  console.log(`DEBUG: Mouse movement detected. Current state: isAutomationRunning: ${isAutomationRunning}, pauseTimeout: ${!!pauseTimeout}, isHoldingBlueBox: ${isHoldingBlueBox}`);

  if (!isAutomationRunning) { // Only pause if automation is actually running
    console.log('DEBUG: Automation not running, ignoring mouse move.');
    return;
  }

  isAutomationRunning = false; // Temporarily stop the loop in finishBuild.js
  console.log('DEBUG: Automation loop in finishBuild.js will stop.');

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
