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
const finishBuildStatus = document.getElementById('finishBuildStatus');
const finishBuildStatusList = document.getElementById('finishBuildStatusList');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clickAroundTrueBtn = document.getElementById('clickAroundTrueBtn');
const clickAroundFalseBtn = document.getElementById('clickAroundFalseBtn');

// New DOM Elements for Function Display
const currentFunctionDisplay = document.getElementById('currentFunction');
const currentLevelNameDisplay = document.getElementById('currentLevelName'); // New: Level name display
const currentLevelDurationDisplay = document.getElementById('currentLevelDuration'); // New
const previousLevelDurationDisplay = document.getElementById('previousLevelDuration'); // New
const longestLevelDurationDisplay = document.getElementById('longestLevelDuration'); // New
const shortestLevelDurationDisplay = document.getElementById('shortestLevelDuration'); // New
const levelsFinishedCountDisplay = document.getElementById('levelsFinishedCount'); // New
const averageLevelDurationDisplay = document.getElementById('averageLevelDuration'); // New

// Scroll settings DOM elements (kept for internal use)
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
let isAutomationRunning = false;
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
// Start button event listener - starts the finish level automation
startBtn.addEventListener('click', async () => {
    if (!isAutomationRunning) {
        isAutomationRunning = true;
        isFinishLevelRunning = true;
        startBtn.classList.remove('btn-secondary');
        startBtn.classList.add('btn-success');
        startBtn.textContent = 'Running...';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        console.log(`DEBUG: Starting finish level automation`);
        const scrollSwipeDistance = parseInt(scrollSwipeDistanceInput.value, 10);
        const scrollToBottomIterations = parseInt(scrollToBottomIterationsInput.value, 10);
        const scrollUpAttempts = parseInt(scrollUpAttemptsInput.value, 10);
        await ipcRenderer.invoke('toggle-finish-level', true, scrollSwipeDistance, scrollToBottomIterations, scrollUpAttempts);
    }
});

// Stop button event listener - stops all automation
stopBtn.addEventListener('click', async () => {
    if (isAutomationRunning) {
        isAutomationRunning = false;
        isFinishLevelRunning = false;
        isFinishBuildRunning = false;
        isClickAroundRunning = false;
        
        startBtn.classList.remove('btn-success');
        startBtn.classList.add('btn-secondary');
        startBtn.textContent = 'Start';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        console.log(`DEBUG: Stopping all automation`);
        await ipcRenderer.invoke('toggle-finish-level', false, 0, 0, 0);
        await ipcRenderer.invoke('toggle-finish-build', false);
        await ipcRenderer.invoke('toggle-click-around', false);
        
        // Reset click around buttons immediately since we're stopping them
        clickAroundTrueBtn.textContent = 'Click Around True';
        clickAroundTrueBtn.classList.remove('btn-danger');
        clickAroundTrueBtn.classList.add('btn-secondary');
        
        clickAroundFalseBtn.textContent = 'Click Around False';
        clickAroundFalseBtn.classList.remove('btn-danger');
        clickAroundFalseBtn.classList.add('btn-secondary');
        
        updateStatus('All automation stopped.', 'info');
    }
});

// Click Around True event listener
clickAroundTrueBtn.addEventListener('click', async () => {
    isClickAroundRunning = !isClickAroundRunning;
    if (isClickAroundRunning) {
        clickAroundTrueBtn.textContent = 'Stop Click Around True';
        clickAroundTrueBtn.classList.remove('btn-secondary');
        clickAroundTrueBtn.classList.add('btn-danger');
        updateStatus('Starting Click Around automation (exclude red blobs)...', 'info');
        // Activate iPhone Mirroring for testing
        await ipcRenderer.invoke('activate-iphone-mirroring');
    } else {
        clickAroundTrueBtn.textContent = 'Click Around True';
        clickAroundTrueBtn.classList.remove('btn-danger');
        clickAroundTrueBtn.classList.add('btn-secondary');
        updateStatus('Stopping Click Around automation...', 'info');
    }
    await ipcRenderer.invoke('toggle-click-around', isClickAroundRunning, true);
});

// Click Around False event listener
clickAroundFalseBtn.addEventListener('click', async () => {
    isClickAroundRunning = !isClickAroundRunning;
    if (isClickAroundRunning) {
        clickAroundFalseBtn.textContent = 'Stop Click Around False';
        clickAroundFalseBtn.classList.remove('btn-secondary');
        clickAroundFalseBtn.classList.add('btn-danger');
        updateStatus('Starting Click Around automation (include red blobs)...', 'info');
        // Activate iPhone Mirroring for testing
        await ipcRenderer.invoke('activate-iphone-mirroring');
    } else {
        clickAroundFalseBtn.textContent = 'Click Around False';
        clickAroundFalseBtn.classList.remove('btn-danger');
        clickAroundFalseBtn.classList.add('btn-secondary');
        updateStatus('Stopping Click Around automation...', 'info');
    }
    await ipcRenderer.invoke('toggle-click-around', isClickAroundRunning, false);
});

// Scroll button event listeners removed - scroll controls are now handled internally by automation

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

// New: IPC listener for current level name updates
ipcRenderer.on('update-current-level-name', (event, levelName) => {
    if (currentLevelNameDisplay) {
        currentLevelNameDisplay.textContent = `Level: ${levelName}`;
    }
});

// IPC listener for click around stopped events to reset button states
ipcRenderer.on('click-around-stopped', () => {
    // Reset both click around buttons to their initial state
    isClickAroundRunning = false;
    
    // Reset Click Around True button
    clickAroundTrueBtn.textContent = 'Click Around True';
    clickAroundTrueBtn.classList.remove('btn-danger');
    clickAroundTrueBtn.classList.add('btn-secondary');
    
    // Reset Click Around False button
    clickAroundFalseBtn.textContent = 'Click Around False';
    clickAroundFalseBtn.classList.remove('btn-danger');
    clickAroundFalseBtn.classList.add('btn-secondary');
});

// Initialize
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
    
    // Initialize button states
    stopBtn.disabled = true;
    console.log('DEBUG: DOMContentLoaded handler finished.');
});
