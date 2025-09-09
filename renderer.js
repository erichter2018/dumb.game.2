const { ipcRenderer } = require('electron');

// DOM elements
const startLiveViewBtn = document.getElementById('startLiveViewBtn');
const stopLiveViewBtn = document.getElementById('stopLiveViewBtn');
const previewCanvas = document.getElementById('previewCanvas');
const previewOverlay = document.getElementById('previewOverlay');
const statusText = document.getElementById('statusText');
const coordinates = document.getElementById('coordinates');

// New Detection DOM elements
const detectRedBlobBtn = document.getElementById('detectRedBlobBtn');
const redBlobResults = document.getElementById('redBlobResults');
const detectBlueBoxBtn = document.getElementById('detectBlueBoxBtn');
const blueBoxResults = document.getElementById('blueBoxResults');

// DOM Elements for Automation Controls
const toggleFinishBuildBtn = document.getElementById('toggleFinishBuildBtn');
const finishBuildStatus = document.getElementById('finishBuildStatus');
const finishBuildStatusList = document.getElementById('finishBuildStatusList');

// DOM Elements for Global Pause Controls
const pauseEnabledCheckbox = document.getElementById('pauseEnabled');
const mouseThresholdInput = document.getElementById('mouseThreshold');
const idleTimeInput = document.getElementById('idleTime');
const forceResumeBtn = document.getElementById('forceResumeBtn');
const pauseStatus = document.getElementById('pauseStatus');
const toggleFinishLevelBtn = document.getElementById('toggleFinishLevelBtn');
const toggleClickAroundBtn = document.getElementById('toggleClickAroundBtn');

// New DOM Elements for Function Display
const currentFunctionDisplay = document.getElementById('currentFunction');
const currentLevelDurationDisplay = document.getElementById('currentLevelDuration'); // New
const previousLevelDurationDisplay = document.getElementById('previousLevelDuration'); // New
const longestLevelDurationDisplay = document.getElementById('longestLevelDuration'); // New
const shortestLevelDurationDisplay = document.getElementById('shortestLevelDuration'); // New
const levelsFinishedCountDisplay = document.getElementById('levelsFinishedCount'); // New
const averageLevelDurationDisplay = document.getElementById('averageLevelDuration'); // New

// New DOM Elements for Scrolling Controls
const scrollDownBtn = document.getElementById('scrollDownBtn');
const scrollUpBtn = document.getElementById('scrollUpBtn');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
// New DOM Elements for Scroll Settings
const scrollSwipeDistanceInput = document.getElementById('scrollSwipeDistance');
const scrollToBottomIterationsInput = document.getElementById('scrollToBottomIterations');
const scrollUpAttemptsInput = document.getElementById('scrollUpAttempts');

// Canvas context
const ctx = previewCanvas.getContext('2d');

// State
let isCapturing = false;
let lastCapture = null;
let currentRegion = { x: 0, y: 100, width: 450, height: 900 }; // Default, will be updated by main process
let isFinishBuildRunning = false;
let isFinishLevelRunning = false;
let isClickAroundRunning = false;

// Function to update status - now unified
function updateStatus(message, type = 'info') {
    statusText.textContent = message; // Update the general statusText
    statusText.className = `status-update ${type}`;
    finishBuildStatus.textContent = message; // Update the single-line finish build status
    finishBuildStatus.className = `status-update ${type}`;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

async function drawImageOnCanvas(imageData) {
    console.log('DEBUG: drawImageOnCanvas called.');
    const img = new Image();
    img.onload = () => {
        console.log('DEBUG: Image loaded for canvas drawing.');
        // Use the currentRegion from the main process
        const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = currentRegion;

        // Set canvas size to match its CSS-defined dimensions
        previewCanvas.width = previewCanvas.clientWidth;
        previewCanvas.height = previewCanvas.clientHeight;

        // Clear canvas and draw cropped region, scaled to fill the canvas
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        ctx.drawImage(
            img,
            regionX, regionY, regionWidth, regionHeight, // source region
            0, 0, previewCanvas.width, previewCanvas.height // destination (fills the entire canvas)
        );

        const scale = previewCanvas.width / regionWidth;
        lastCapture = img;
    };
    
    // Handle both data URLs and base64 strings
    if (imageData.startsWith('data:')) {
        img.src = imageData;
    } else {
        img.src = `data:image/png;base64,${imageData}`;
    }
}

function drawOverlay(x, y, color = 'red') {
    if (!lastCapture) return;
    
    previewOverlay.innerHTML = '';
    const marker = document.createElement('div');
    marker.style.position = 'absolute';
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.style.width = '20px';
    marker.style.height = '20px';
    marker.style.borderRadius = '50%';
    marker.style.backgroundColor = color;
    marker.style.border = '2px solid white';
    marker.style.transform = 'translate(-50%, -50%)';
    marker.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    marker.style.pointerEvents = 'none';
    
    previewOverlay.appendChild(marker);
}

// Event listeners
startLiveViewBtn.addEventListener('click', async () => {
    // This button will be hidden by default as live view auto-starts.
    // If it's ever visible and clicked, it should re-start the live view.
    try {
        updateStatus('Starting live view...', 'info');
        await ipcRenderer.invoke('start-live-view');
        isCapturing = true;
        startLiveViewBtn.style.display = 'none';
        stopLiveViewBtn.style.display = 'block';
        updateStatus('Live view started', 'success');
    } catch (error) {
        updateStatus(`Failed to start live view: ${error.message}`, 'error');
    }
});

stopLiveViewBtn.addEventListener('click', async () => {
    try {
        updateStatus('Stopping live view...', 'info');
        await ipcRenderer.invoke('stop-live-view');
        isCapturing = false;
        startLiveViewBtn.style.display = 'block';
        stopLiveViewBtn.style.display = 'none';
        updateStatus('Live view stopped', 'success');
        
        // Retain last screenshot on stop
        if (lastCapture) {
            drawImageOnCanvas(lastCapture.src); // Redraws the last image without needing to refetch
        }
    } catch (error) {
        updateStatus(`Failed to stop live view: ${error.message}`, 'error');
    }
});

// Handle toggle finish build button click
toggleFinishBuildBtn.addEventListener('click', async () => {
    isFinishBuildRunning = !isFinishBuildRunning;
    if (isFinishBuildRunning) {
        toggleFinishBuildBtn.textContent = 'Stop Finish Build';
        toggleFinishBuildBtn.classList.remove('btn-secondary');
        toggleFinishBuildBtn.classList.add('btn-danger');
    } else {
        toggleFinishBuildBtn.textContent = 'Start Finish Build';
        toggleFinishBuildBtn.classList.remove('btn-danger');
        toggleFinishBuildBtn.classList.add('btn-secondary');
    }
    console.log(`DEBUG: Toggling finish build automation to: ${isFinishBuildRunning}`);
    await ipcRenderer.invoke('toggle-finish-build', isFinishBuildRunning);
});

// Handle toggle finish level button click
toggleFinishLevelBtn.addEventListener('click', async () => {
    isFinishLevelRunning = !isFinishLevelRunning;
    if (isFinishLevelRunning) {
        toggleFinishLevelBtn.textContent = 'Stop Finish Level';
        toggleFinishLevelBtn.classList.remove('btn-secondary');
        toggleFinishLevelBtn.classList.add('btn-danger');
    } else {
        toggleFinishLevelBtn.textContent = 'Start Finish Level';
        toggleFinishLevelBtn.classList.remove('btn-danger');
        toggleFinishLevelBtn.classList.add('btn-secondary');
    }
    console.log(`DEBUG: Toggling finish level automation to: ${isFinishLevelRunning}`);
    const scrollSwipeDistance = parseInt(scrollSwipeDistanceInput.value, 10);
    const scrollToBottomIterations = parseInt(scrollToBottomIterationsInput.value, 10);
    const scrollUpAttempts = parseInt(scrollUpAttemptsInput.value, 10);
    await ipcRenderer.invoke('toggle-finish-level', isFinishLevelRunning, scrollSwipeDistance, scrollToBottomIterations, scrollUpAttempts);
});

// Click Around event listener
toggleClickAroundBtn.addEventListener('click', async () => {
    isClickAroundRunning = !isClickAroundRunning;
    if (isClickAroundRunning) {
        toggleClickAroundBtn.textContent = 'Stop Click Around';
        toggleClickAroundBtn.classList.remove('btn-secondary');
        toggleClickAroundBtn.classList.add('btn-danger');
        updateStatus('Starting Click Around automation...', 'info');
        // Activate iPhone Mirroring for testing
        await ipcRenderer.invoke('activate-iphone-mirroring');
    } else {
        toggleClickAroundBtn.textContent = 'Start Click Around';
        toggleClickAroundBtn.classList.remove('btn-danger');
        toggleClickAroundBtn.classList.add('btn-secondary');
        updateStatus('Stopping Click Around automation...', 'info');
    }
    await ipcRenderer.invoke('toggle-click-around', isClickAroundRunning);
});

// Event listeners for new scrolling buttons
scrollDownBtn.addEventListener('click', async () => {
    updateStatus('Scrolling down...', 'info');
    try {
        await ipcRenderer.invoke('activate-iphone-mirroring'); // Activate app before scroll
        const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = currentRegion;
        const centerX = regionX + regionWidth / 2;
        const centerY = regionY + regionHeight / 2;
        const scrollDistance = parseInt(scrollSwipeDistanceInput.value, 10);
        console.log(`DEBUG: Scroll Down initiated at centerX: ${centerX}, centerY: ${centerY}, distance: ${scrollDistance}`);
        await ipcRenderer.invoke('scroll-down', centerX, centerY, scrollDistance); // Use configurable distance
        updateStatus('Scrolled down.', 'success');
    } catch (error) {
        updateStatus(`Failed to scroll down: ${error.message}`, 'error');
    }
});

scrollUpBtn.addEventListener('click', async () => {
    updateStatus('Scrolling up...', 'info');
    try {
        await ipcRenderer.invoke('activate-iphone-mirroring'); // Activate app before scroll
        const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = currentRegion;
        const centerX = regionX + regionWidth / 2;
        const centerY = regionY + regionHeight / 2;
        const scrollDistance = parseInt(scrollSwipeDistanceInput.value, 10);
        console.log(`DEBUG: Scroll Up initiated at centerX: ${centerX}, centerY: ${centerY}, distance: ${scrollDistance}`);
        await ipcRenderer.invoke('scroll-up', centerX, centerY, scrollDistance); // Use configurable distance
        updateStatus('Scrolled up.', 'success');
    } catch (error) {
        updateStatus(`Failed to scroll up: ${error.message}`, 'error');
    }
});

scrollToBottomBtn.addEventListener('click', async () => {
    updateStatus('Scrolling to bottom...', 'info');
    try {
        await ipcRenderer.invoke('activate-iphone-mirroring'); // Activate app before scroll
        const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = currentRegion;
        const centerX = regionX + regionWidth / 2;
        const centerY = regionY + regionHeight / 2;
        const scrollDistance = parseInt(scrollSwipeDistanceInput.value, 10);
        const scrollIterations = parseInt(scrollToBottomIterationsInput.value, 10);
        console.log(`DEBUG: Scroll to Bottom initiated at centerX: ${centerX}, centerY: ${centerY}, distance: ${scrollDistance}, iterations: ${scrollIterations}`);
        await ipcRenderer.invoke('scroll-to-bottom', centerX, centerY, scrollDistance, scrollIterations); // Use configurable distance and iterations
        updateStatus('Scrolled to bottom.', 'success');
    } catch (error) {
        updateStatus(`Failed to scroll to bottom: ${error.message}`, 'error');
    }
});

// Helper to display detection results
function displayDetections(resultsContainer, detections) {
    resultsContainer.innerHTML = ''; // Clear previous results
    if (detections.length === 0) {
        resultsContainer.textContent = 'No objects detected.';
        return;
    }

    detections.forEach((item, index) => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'detection-item';
        const idText = item.name === "research blob" ? "research" : `${item.id}.`; // Display "research" or "ID."
        
        let displayText = `<span>${idText} X:${item.x}, Y:${item.y}</span>`;
        if (item.state) {
            displayText += `<span> (${item.state})</span>`;
        }
        if (item.source) {
            displayText += `<span> [Source: ${item.source}]</span>`;
        }
        resultDiv.innerHTML = displayText;
        
        if (item.image) {
            const img = document.createElement('img');
            img.src = item.image;
            img.alt = `Detection ${idText}`;
            resultDiv.appendChild(img);
        }
        resultsContainer.appendChild(resultDiv);
    });
}

// Detection Button Event Listeners
detectRedBlobBtn.addEventListener('click', async () => {
    updateStatus('Detecting red blobs...', 'info');
    try {
        const result = await ipcRenderer.invoke('detect-red-blob');
        if (result.success) {
            updateStatus(`${result.detections.length} red blobs detected.`, 'success');
            console.log('Red Blob Detections:', result.detections);
            displayDetections(redBlobResults, result.detections);
        } else {
            updateStatus(`Red blob detection failed: ${result.error}`, 'error');
        }
    } catch (error) {
        updateStatus(`Error during red blob detection: ${error.message}`, 'error');
    }
});

detectBlueBoxBtn.addEventListener('click', async () => {
    updateStatus('Detecting blue boxes...', 'info');
    try {
        const result = await ipcRenderer.invoke('detect-blue-box');
        if (result.success) {
            updateStatus(`${result.detections.length} blue boxes detected.`, 'success');
            console.log('Blue Box Detections:', result.detections);
            displayDetections(blueBoxResults, result.detections);
        } else {
            updateStatus(`Blue box detection failed: ${result.error}`, 'error');
        }
    } catch (error) {
        updateStatus(`Error during blue box detection: ${error.message}`, 'error');
    }
});

// Mouse coordinate tracking
previewCanvas.addEventListener('mousemove', async (e) => { // Added async here
    const rect = previewCanvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left; // X relative to canvas
    const clientY = e.clientY - rect.top; // Y relative to canvas

    // Ensure currentRegion is up-to-date
    if (!currentRegion || currentRegion.width === 0) { // Check for initial load or invalid state
        currentRegion = await ipcRenderer.invoke('get-capture-region');
    }

    // Use currentRegion for calculations
    const { x: currentRegionX, y: currentRegionY, width: currentRegionWidth } = currentRegion;

    // Calculate the scaling factor of the displayed live view
    const scaleFactor = previewCanvas.width / currentRegionWidth;

    // Convert mouse coordinates on canvas to coordinates within the *original* capture region
    const xInRegion = Math.round(clientX / scaleFactor);
    const yInRegion = Math.round(clientY / scaleFactor);

    // Add the region's top-left corner to get actual screen coordinates
    const actualScreenX = xInRegion + currentRegionX;
    const actualScreenY = yInRegion + currentRegionY;

    coordinates.textContent = `Mouse: (${actualScreenX}, ${actualScreenY})`;
});

// Mouse movement debounce and IPC
let mouseMoveTimer = null;
const MOUSE_MOVE_THRESHOLD = 1; // Pixels
const MOUSE_MOVE_DEBOUNCE_TIME = 20; // Milliseconds

let lastMouseX = -1;
let lastMouseY = -1;

document.addEventListener('mousemove', (e) => {
  if (!isFinishBuildRunning && !isFinishLevelRunning && !isClickAroundRunning) { // Only active if any automation is running
    return;
  }

  const currentMouseX = e.screenX;
  const currentMouseY = e.screenY;

  if (lastMouseX === -1 || lastMouseY === -1) {
    lastMouseX = currentMouseX;
    lastMouseY = currentMouseY;
    return;
  }

  const distance = Math.sqrt(
    Math.pow(currentMouseX - lastMouseX, 2) + Math.pow(currentMouseY - lastMouseY, 2)
  );

  if (distance > MOUSE_MOVE_THRESHOLD) {
    lastMouseX = currentMouseX;
    lastMouseY = currentMouseY;

    if (mouseMoveTimer) {
      clearTimeout(mouseMoveTimer);
    }

    mouseMoveTimer = setTimeout(async () => {
      console.log('Significant mouse movement detected, signaling main process to pause automation.');
      await ipcRenderer.invoke('pause-automation-on-mouse-move');
    }, MOUSE_MOVE_DEBOUNCE_TIME);
  }
});

// IPC event listeners
ipcRenderer.on('live-view-update', (event, imageData) => {
    drawImageOnCanvas(imageData);
});

ipcRenderer.on('live-view-error', (event, errorMessage) => {
    updateStatus(`Live view error: ${errorMessage}`, 'error');
});

ipcRenderer.on('finish-build-status', (event, message, type) => {
    // This is the single-line status, but `updateStatus` now handles both.
    // The `finish-build-status-list` IPC will also call updateStatus
    // so that it logs correctly as well.
    // updateStatus(message, type); // This will be handled by finish-build-status-list
});

ipcRenderer.on('finish-build-status-list', (event, history) => {
  finishBuildStatusList.innerHTML = ''; // Clear existing list
  history.forEach(item => {
    const p = document.createElement('p');
    p.textContent = `[${item.timestamp}] ${item.message}`;
    p.className = `status-${item.type || 'info'}`;
    finishBuildStatusList.prepend(p); // Add new messages to the top
  });
  // Also update the single line status with the latest message from the history
  if (history.length > 0) {
    const latestItem = history[history.length - 1]; // Get the most recent message
    finishBuildStatus.textContent = latestItem.message; // Update the single line status
    finishBuildStatus.className = `status-update ${latestItem.type || 'info'}`;
  }
});

ipcRenderer.on('shortcut-stop', async () => {
    // Trigger the stop live view functionality when shortcut is pressed
    await stopLiveViewBtn.click();
});

// IPC listener for current function updates
ipcRenderer.on('update-current-function', (event, functionName) => {
    if (currentFunctionDisplay) {
        currentFunctionDisplay.textContent = functionName ? `Current Function: ${functionName}` : 'Idle';
    }
});

// IPC listener for current level duration updates
ipcRenderer.on('update-current-level-duration', (event, durationText) => {
    if (currentLevelDurationDisplay) {
        currentLevelDurationDisplay.textContent = `Current Level: ${durationText}`;
    }
});

// IPC listener for previous level duration updates
ipcRenderer.on('update-previous-level-duration', (event, durationText) => {
    if (previousLevelDurationDisplay) {
        previousLevelDurationDisplay.textContent = `Previous Level: ${durationText}`;
    }
});

// New: IPC listener for longest level duration updates
ipcRenderer.on('update-longest-level-duration', (event, durationText) => {
    if (longestLevelDurationDisplay) {
        longestLevelDurationDisplay.textContent = `Longest Level: ${durationText}`;
    }
});

// New: IPC listener for shortest level duration updates
ipcRenderer.on('update-shortest-level-duration', (event, durationText) => {
    if (shortestLevelDurationDisplay) {
        shortestLevelDurationDisplay.textContent = `Shortest Level: ${durationText}`;
    }
});

// New: IPC listener for levels finished count updates
ipcRenderer.on('update-levels-finished-count', (event, count) => {
    if (levelsFinishedCountDisplay) {
        levelsFinishedCountDisplay.textContent = `Levels Finished: ${count}`;
    }
});

// New: IPC listener for average level duration updates
ipcRenderer.on('update-average-level-duration', (event, durationText) => {
    if (averageLevelDurationDisplay) {
        averageLevelDurationDisplay.textContent = `Average Duration: ${durationText}`;
    }
});

// Initialize
// Global Pause Controls Event Listeners
pauseEnabledCheckbox.addEventListener('change', async () => {
    await updatePauseSettings();
});

mouseThresholdInput.addEventListener('change', async () => {
    await updatePauseSettings();
});

idleTimeInput.addEventListener('change', async () => {
    await updatePauseSettings();
});

forceResumeBtn.addEventListener('click', async () => {
    try {
        await ipcRenderer.invoke('force-resume-automation');
        updateStatus('Automation force-resumed', 'success');
    } catch (error) {
        updateStatus(`Failed to force resume: ${error.message}`, 'error');
    }
});

// Function to update pause settings
async function updatePauseSettings() {
    try {
        const settings = {
            enabled: pauseEnabledCheckbox.checked,
            mouseThreshold: parseInt(mouseThresholdInput.value),
            idleTime: parseInt(idleTimeInput.value)
        };
        
        await ipcRenderer.invoke('set-global-pause-settings', settings);
        updateStatus('Pause settings updated', 'info');
    } catch (error) {
        updateStatus(`Failed to update pause settings: ${error.message}`, 'error');
    }
}

// Function to load and display pause settings
async function loadPauseSettings() {
    try {
        const settings = await ipcRenderer.invoke('get-global-pause-settings');
        
        pauseEnabledCheckbox.checked = settings.enabled;
        mouseThresholdInput.value = settings.mouseThreshold;
        idleTimeInput.value = settings.idleTime;
        
        updatePauseStatus(settings.currentlyPaused);
    } catch (error) {
        console.error('Failed to load pause settings:', error);
    }
}

// Function to update pause status display
function updatePauseStatus(isPaused) {
    if (pauseStatus) {
        pauseStatus.textContent = `Pause Status: ${isPaused ? 'PAUSED' : 'Active'}`;
        pauseStatus.className = isPaused ? 'status-paused' : 'status-active';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DEBUG: DOMContentLoaded event fired in renderer.js.');
    updateStatus('Initializing...', 'info');

    // Fetch initial region settings (now from main process)
    try {
        console.log('DEBUG: Attempting to fetch initial region settings...');
        currentRegion = await ipcRenderer.invoke('get-capture-region');
        console.log('DEBUG: Initial region settings fetched:', currentRegion);
        updateStatus('Region settings loaded', 'success');
    } catch (error) {
        console.error('ERROR: Error loading region settings:', error);
        updateStatus('Error loading region settings: ' + error.message, 'error');
    }

    // Live view is now disabled by default - user must manually start it
    console.log('DEBUG: Live view disabled by default - user must start manually.');
    isCapturing = false; // Live view disabled by default
    startLiveViewBtn.style.display = 'block';
    stopLiveViewBtn.style.display = 'none';
    
    // Load global pause settings
    await loadPauseSettings();
    
    console.log('DEBUG: DOMContentLoaded handler finished.');
});
