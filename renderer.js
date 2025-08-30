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

// Canvas context
const ctx = previewCanvas.getContext('2d');

// State
let isCapturing = false;
let lastCapture = null;
let currentRegion = { x: 0, y: 100, width: 450, height: 900 }; // Default, will be updated by main process
let isFinishBuildRunning = false;

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
    console.log('DEBUG: Toggle Finish Build button clicked. Current state: isFinishBuildRunning:', isFinishBuildRunning);
    try {
        isFinishBuildRunning = !isFinishBuildRunning;
        if (isFinishBuildRunning) {
            updateStatus('Starting Finish Build...', 'info');
            toggleFinishBuildBtn.textContent = 'Stop Finish Build';
            toggleFinishBuildBtn.classList.remove('btn-secondary');
            toggleFinishBuildBtn.classList.add('btn-warning');
            console.log('DEBUG: Invoking toggle-finish-build with true.');
            const result = await ipcRenderer.invoke('toggle-finish-build', true);
            console.log('DEBUG: toggle-finish-build IPC result:', result);
            if (result.success) {
                updateStatus(result.message, 'success');
            } else {
                updateStatus(`Error starting: ${result.error}`, 'error');
                isFinishBuildRunning = false; // Revert state on error
                toggleFinishBuildBtn.textContent = 'Start Finish Build';
                toggleFinishBuildBtn.classList.remove('btn-warning');
                toggleFinishBuildBtn.classList.add('btn-secondary');
            }
        } else {
            updateStatus('Stopping Finish Build...', 'info');
            toggleFinishBuildBtn.textContent = 'Start Finish Build';
            toggleFinishBuildBtn.classList.remove('btn-warning');
            toggleFinishBuildBtn.classList.add('btn-secondary');
            console.log('DEBUG: Invoking toggle-finish-build with false.');
            const result = await ipcRenderer.invoke('toggle-finish-build', false);
            console.log('DEBUG: toggle-finish-build IPC result:', result);
            if (result.success) {
                updateStatus(result.message, 'success');
            } else {
                updateStatus(`Error stopping: ${result.error}`, 'error');
            }
        }
    } catch (error) {
        console.error(`ERROR: Error toggling Finish Build: ${error.message}`, error);
        updateStatus(`Error toggling Finish Build: ${error.message}`, 'error');
        isFinishBuildRunning = false; // Ensure state is consistent
        toggleFinishBuildBtn.textContent = 'Start Finish Build';
        toggleFinishBuildBtn.classList.remove('btn-warning');
        toggleFinishBuildBtn.classList.add('btn-secondary');
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
        resultDiv.innerHTML = `<span>${idText} X:${item.x}, Y:${item.y}</span>`;
        
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
  if (!isFinishBuildRunning) { // Only active if automation is running
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

    // The live view is now auto-started by main.js, so we just update the UI state
    console.log('DEBUG: Assuming live view starts automatically.');
    isCapturing = true; // Assume live view starts automatically
    startLiveViewBtn.style.display = 'none';
    stopLiveViewBtn.style.display = 'block';
    updateStatus('Live view started automatically', 'success');
    console.log('DEBUG: DOMContentLoaded handler finished.');
});
