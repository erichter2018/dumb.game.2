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

// Overlay state and variables
let overlayEnabled = true; // Default to enabled
let overlayOpacity = 0.8;
let latestDetections = { redBlobs: [], blueBoxes: [] };
let currentLiveViewImage = null;
let scrollOccurred = false; // Track if scrolling has happened
let overlayCanvas = null;
let overlayCtx = null;

// Function to update status - now unified with activity log
function updateStatus(message, type = 'info') {
    statusText.textContent = message; // Update the general statusText
    statusText.className = `status-update ${type}`;
    finishBuildStatus.textContent = message; // Update the single-line finish build status
    finishBuildStatus.className = `status-update ${type}`;
    
    // Add to activity log
    addLogEntry(message, type);
    
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

// Activity Log Management
let activityLogContainer = null;
let logEntries = [];
const MAX_LOG_ENTRIES = 50;

function initializeActivityLog() {
    activityLogContainer = document.getElementById('activityLog');
}

function addLogEntry(message, type = 'info') {
    if (!activityLogContainer) return;
    
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    
    // Clean up the message - remove excessive debug info and emojis for cleaner logs
    let cleanMessage = message
        .replace(/DEBUG:\s*/g, '')
        .replace(/🔍|📐|✅|🎯|📋|🖼️|📸|🎉|❌/g, '')
        .replace(/Red blob detection starting\.\.\./, 'Starting red blob detection')
        .replace(/Image dimensions: (\d+)x(\d+)/, 'Image: $1×$2')
        .replace(/Found (\d+) red blobs before filtering/, '$1 blobs found')
        .replace(/Final result: (\d+) blobs after filtering/, '$1 blobs after filtering')
        .replace(/Detection complete: (\d+) blobs found/, 'Detection complete: $1 blobs')
        .replace(/Found red blob at \((\d+), (\d+)\) - (\d+)x(\d+)/, 'Blob at ($1,$2) [$3×$4]')
        .replace(/Excluding blob at \((\d+), (\d+)\) - in exclusion zone/, 'Excluded blob at ($1,$2)')
        .replace(/Extracting blob #(\d+)( \([^)]+\))? at \((\d+), (\d+)\)/, 'Extract blob #$1 at ($3,$4)')
        .trim();
    
    // Skip very verbose or repetitive messages
    if (cleanMessage.includes('DEBUG:') || 
        cleanMessage.includes('Performing click at') ||
        cleanMessage.includes('Waiting') ||
        cleanMessage.length > 100) {
        return;
    }
    
    // Smart categorization based on message content
    let smartType = type;
    if (cleanMessage.includes('detection') || cleanMessage.includes('blobs') || cleanMessage.includes('boxes')) {
        smartType = 'detection';
    } else if (cleanMessage.includes('click') || cleanMessage.includes('Click')) {
        smartType = 'click';
    } else if (cleanMessage.includes('automation') || cleanMessage.includes('Starting') || cleanMessage.includes('Stopping')) {
        smartType = 'automation';
    } else if (cleanMessage.includes('build') || cleanMessage.includes('Build') || cleanMessage.includes('research')) {
        smartType = 'build';
    } else if (cleanMessage.includes('error') || cleanMessage.includes('Error') || cleanMessage.includes('failed')) {
        smartType = 'error';
    } else if (cleanMessage.includes('warning') || cleanMessage.includes('Warning')) {
        smartType = 'warning';
    } else if (cleanMessage.includes('complete') || cleanMessage.includes('loaded') || cleanMessage.includes('started')) {
        smartType = 'success';
    }
    
    const entry = { timestamp, message: cleanMessage, type: smartType };
    logEntries.unshift(entry); // Add to beginning
    
    // Limit log entries
    if (logEntries.length > MAX_LOG_ENTRIES) {
        logEntries = logEntries.slice(0, MAX_LOG_ENTRIES);
    }
    
    // Update display
    updateActivityLogDisplay();
}

function updateActivityLogDisplay() {
    if (!activityLogContainer) return;
    
    activityLogContainer.innerHTML = logEntries
        .slice(0, 60) // Show 60 entries (3x more for the taller log area)
        .map(entry => `<div class="log-entry ${entry.type}">[${entry.timestamp}] ${entry.message}</div>`)
        .join('');
    
    // Auto-scroll to top (newest entries)
    activityLogContainer.scrollTop = 0;
}

// Helper to display detection results in summary format
function displayDetectionSummary(detections, type = 'objects') {
    const summaryContainer = document.getElementById('detectionResults');
    if (!summaryContainer) return;
    
    if (detections.length === 0) {
        summaryContainer.textContent = `No ${type} detected`;
        return;
    }

    const namedBlobs = detections.filter(d => d.name);
    const regularBlobs = detections.filter(d => !d.name);
    
    let summary = `${detections.length} ${type} found`;
    if (namedBlobs.length > 0) {
        summary += ` (${namedBlobs.map(b => b.name).join(', ')})`;
    }
    
    summaryContainer.textContent = summary;
}

// Overlay functionality
function initializeOverlay() {
    // Get overlay control elements
    const showOverlayCheckbox = document.getElementById('showOverlay');
    const overlayOpacitySlider = document.getElementById('overlayOpacity');
    
    if (showOverlayCheckbox) {
        // Set checkbox to match default state
        showOverlayCheckbox.checked = overlayEnabled;
        
        showOverlayCheckbox.addEventListener('change', (e) => {
            overlayEnabled = e.target.checked;
            if (overlayEnabled) {
                drawDetectionOverlay();
            } else {
                // Redraw canvas without overlay
                if (currentLiveViewImage) {
                    drawImageOnCanvas(currentLiveViewImage);
                }
            }
        });
    }
    
    if (overlayOpacitySlider) {
        overlayOpacitySlider.addEventListener('input', (e) => {
            overlayOpacity = parseFloat(e.target.value);
            if (overlayEnabled) {
                // Redraw the canvas with the new opacity
                if (currentLiveViewImage) {
                    drawImageOnCanvas(currentLiveViewImage);
                }
                drawDetectionOverlay();
            }
        });
    }
}

function drawDetectionOverlay() {
    console.log('🎨 drawDetectionOverlay called - overlayEnabled:', overlayEnabled, 'previewCanvas:', !!previewCanvas);
    if (!overlayEnabled) return;
    
    // Use the existing preview canvas
    if (!previewCanvas) {
        console.log('🚫 No previewCanvas found');
        return;
    }

    // Save the current canvas state
    ctx.save();
    
    // Set overlay opacity
    ctx.globalAlpha = overlayOpacity;
    
    // Calculate scaling factors for overlay coordinates
    const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = currentRegion;
    const scaleX = previewCanvas.width / regionWidth;
    const scaleY = previewCanvas.height / regionHeight;
    
    console.log('🎨 Drawing overlays - scaleX:', scaleX, 'scaleY:', scaleY);
    
    // Draw exclusion zones in dark yellow (these are static and don't change)
    const EXCLUSION_RECTS = [
        { x: 0, y: 0, width: 100, height: 500 }, // Top-left area
        { x: 0, y: 0, width: 450, height: 410 }, // Top area
        { x: 320, y: 0, width: 130, height: 500 }, // Top-right area
        { x: 0, y: 800, width: 100, height: 200 }, // Bottom-left area
        { x: 0, y: 860, width: 450, height: 140 }, // Bottom area
    ];
    
    console.log('🟡 Drawing exclusion zones');
    EXCLUSION_RECTS.forEach((rect, i) => {
        // Calculate the intersection of the exclusion zone with the capture region
        const intersectionX = Math.max(rect.x, regionX);
        const intersectionY = Math.max(rect.y, regionY);
        const intersectionWidth = Math.min(rect.x + rect.width, regionX + regionWidth) - intersectionX;
        const intersectionHeight = Math.min(rect.y + rect.height, regionY + regionHeight) - intersectionY;
        
        // Skip if there's no intersection with the capture region
        if (intersectionWidth <= 0 || intersectionHeight <= 0) {
            console.log(`🟡 Skipping exclusion zone ${i} - no intersection with capture region`);
            return;
        }
        
        // Convert intersection coordinates to canvas coordinates
        const canvasX = (intersectionX - regionX) * scaleX;
        const canvasY = (intersectionY - regionY) * scaleY;
        const canvasWidth = intersectionWidth * scaleX;
        const canvasHeight = intersectionHeight * scaleY;
        
        console.log(`🟡 Drawing exclusion zone ${i}:`, {
            original: rect,
            intersection: { x: intersectionX, y: intersectionY, width: intersectionWidth, height: intersectionHeight },
            canvas: { x: canvasX, y: canvasY, width: canvasWidth, height: canvasHeight }
        });
        
        // Draw exclusion zone outline
        ctx.strokeStyle = '#b8860b'; // Dark goldenrod
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed line to distinguish from detection overlays
        ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
        
        // Draw semi-transparent fill
        ctx.fillStyle = 'rgba(184, 134, 11, 0.2)'; // Dark goldenrod with low opacity
        ctx.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);
    });
    
    // Reset line dash for detection overlays
    ctx.setLineDash([]);
    
    // Draw red blob overlays
    if (latestDetections.redBlobs && latestDetections.redBlobs.length > 0) {
        console.log('🔴 Drawing', latestDetections.redBlobs.length, 'red blob overlays');
        latestDetections.redBlobs.forEach((blob, i) => {
            // Convert blob coordinates to canvas coordinates
            const canvasX = (blob.x - regionX) * scaleX;
            const canvasY = (blob.y - regionY) * scaleY;
            const canvasWidth = blob.width * scaleX;
            const canvasHeight = blob.height * scaleY;
            
            // Skip if blob is outside the current region
            if (blob.x < regionX || blob.y < regionY || 
                blob.x > regionX + regionWidth || blob.y > regionY + regionHeight) {
                return;
            }
            
            // Draw rectangle outline
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 3;
            ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
            
            // Draw semi-transparent fill
            ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
            ctx.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);
        });
    }
    
    // Draw blue box overlays
    if (latestDetections.blueBoxes && latestDetections.blueBoxes.length > 0) {
        console.log('🔵 Drawing', latestDetections.blueBoxes.length, 'blue box overlays');
        latestDetections.blueBoxes.forEach((box, i) => {
            // Convert box coordinates to canvas coordinates
            const canvasX = (box.x - regionX) * scaleX;
            const canvasY = (box.y - regionY) * scaleY;
            const canvasWidth = box.width * scaleX;
            const canvasHeight = box.height * scaleY;
            
            // Skip if box is outside the current region
            if (box.x < regionX || box.y < regionY || 
                box.x > regionX + regionWidth || box.y > regionY + regionHeight) {
                return;
            }
            
            // Draw rectangle outline
            ctx.strokeStyle = '#4444ff';
            ctx.lineWidth = 3;
            ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
            
            // Draw semi-transparent fill
            ctx.fillStyle = 'rgba(68, 68, 255, 0.3)';
            ctx.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);
        });
    }
    
    // Restore canvas state
    ctx.restore();
}

function updateDetections(detections, clearRedBlobs = true) {
    // Store the new detections (even if empty)
    const newDetections = detections || { redBlobs: [], blueBoxes: [] };
    
    console.log('🔄🔄🔄 UPDATE DETECTIONS:', {
        detections: newDetections,
        clearRedBlobs,
        overlayEnabled,
        currentLatest: latestDetections
    });
    
    // Only clear red blobs if clearRedBlobs is true, otherwise preserve existing red blobs
    if (clearRedBlobs) {
        console.log('🧹 CLEARING red blobs and updating with new detections');
        latestDetections = newDetections;
        
        // Force clear the canvas and redraw base image
        if (previewCanvas && ctx) {
            console.log('🧹 Clearing canvas for red blob detection');
            ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            
            if (currentLiveViewImage) {
                console.log('🎨 Redrawing base image');
                drawImageOnCanvas(currentLiveViewImage);
            }
        }
    } else {
        // Preserve existing red blobs, only update blue boxes
        const previousRedBlobs = latestDetections.redBlobs || [];
        const newBlueBoxes = newDetections.blueBoxes || [];
        const newRedBlobs = newDetections.redBlobs || [];
        
        // If new red blobs are provided, use them; otherwise keep existing ones
        latestDetections = {
            redBlobs: newRedBlobs.length > 0 ? newRedBlobs : previousRedBlobs,
            blueBoxes: newBlueBoxes
        };
        
        console.log('🔴 PRESERVING red blobs, updating blue boxes:', {
            previousRedBlobs: previousRedBlobs.length,
            newRedBlobs: newRedBlobs.length,
            finalRedBlobs: latestDetections.redBlobs.length,
            newBlueBoxes: newBlueBoxes.length
        });
    }
    
    // Draw overlays if enabled and there are detections to show
    if (overlayEnabled && 
        ((latestDetections.redBlobs && latestDetections.redBlobs.length > 0) || 
         (latestDetections.blueBoxes && latestDetections.blueBoxes.length > 0))) {
        console.log('🎯 Drawing overlays for detections');
        // Use a longer delay to ensure clearing is complete
        setTimeout(() => {
            drawDetectionOverlay();
        }, 100);
    } else {
        console.log('❌ No overlays to draw - overlayEnabled:', overlayEnabled, 'detections:', latestDetections);
    }
}

// Detection Button Event Listeners
detectRedBlobBtn.addEventListener('click', async () => {
    updateStatus('Detecting red blobs...', 'info');
    try {
        const result = await ipcRenderer.invoke('detect-red-blob');
        if (result.success) {
            updateStatus(`${result.detections.length} red blobs detected`, 'success');
            displayDetectionSummary(result.detections, 'red blobs');
            console.log('Red Blob Detections:', result.detections);
            
            // Update overlay with detection results (clear blue boxes since we're only detecting red)
            updateDetections({ redBlobs: result.detections, blueBoxes: [] });
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
            updateStatus(`${result.detections.length} blue boxes detected`, 'success');
            displayDetectionSummary(result.detections, 'blue boxes');
            console.log('Blue Box Detections:', result.detections);
            
            // Update overlay with detection results (clear red blobs since we're only detecting blue)
            updateDetections({ redBlobs: [], blueBoxes: result.detections });
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
    // Store current image for overlay functionality
    currentLiveViewImage = imageData;
    
    // Always redraw the canvas (this clears any previous overlays)
    drawImageOnCanvas(imageData);
    
    // Apply current overlays if enabled and there are detections to show
    if (overlayEnabled && latestDetections && 
        ((latestDetections.redBlobs && latestDetections.redBlobs.length > 0) || 
         (latestDetections.blueBoxes && latestDetections.blueBoxes.length > 0))) {
        drawDetectionOverlay();
    }
});

ipcRenderer.on('live-view-error', (event, errorMessage) => {
    updateStatus(`Live view error: ${errorMessage}`, 'error');
});

// Throttle overlay updates to prevent overwhelming the system
let overlayUpdateTimeout = null;

// Listen for scroll events to clear overlays
ipcRenderer.on('scroll-occurred', (event) => {
    console.log('📜 SCROLL DETECTED - marking for overlay clear');
    scrollOccurred = true;
});

// Listen for level start events to clear overlays
ipcRenderer.on('clear-overlays', (event) => {
    console.log('🆕 NEW LEVEL START - clearing all overlays');
    latestDetections = { redBlobs: [], blueBoxes: [] };
    
    // Redraw canvas without overlays
    if (previewCanvas && ctx && currentLiveViewImage) {
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        drawImageOnCanvas(currentLiveViewImage);
    }
});

// Listen for detection results for overlay
ipcRenderer.on('detection-results', (event, detections) => {
    console.log('🎯🎯🎯 OVERLAY DETECTION RECEIVED:', JSON.stringify(detections, null, 2));
    console.log('🎯 Red blobs count:', detections?.redBlobs?.length || 0);
    console.log('🎯 Blue boxes count:', detections?.blueBoxes?.length || 0);
    
    // Clear any pending overlay update
    if (overlayUpdateTimeout) {
        clearTimeout(overlayUpdateTimeout);
    }
    
    // Determine what type of detection this is
    const hasRedBlobs = detections.redBlobs && detections.redBlobs.length > 0;
    const hasBlueBoxes = detections.blueBoxes && detections.blueBoxes.length > 0;
    
    // Red blobs should only be cleared if a scroll occurred
    const shouldClearRedBlobs = scrollOccurred;
    
    // If scroll occurred, reset the flag after clearing
    if (scrollOccurred) {
        console.log('🧹 CLEARING RED BLOBS due to scroll');
        scrollOccurred = false;
    } else {
        console.log('🔴 PRESERVING RED BLOBS - no scroll detected');
    }
    
    console.log('🔍🔍🔍 DETECTION ANALYSIS:', {
        hasRedBlobs,
        hasBlueBoxes,
        shouldClearRedBlobs,
        scrollOccurred,
        redBlobsArray: Array.isArray(detections.redBlobs),
        blueBoxesArray: Array.isArray(detections.blueBoxes),
        redBlobsLength: detections.redBlobs?.length,
        blueBoxesLength: detections.blueBoxes?.length
    });
    
    // Schedule overlay update with small delay to allow for rapid calls
    overlayUpdateTimeout = setTimeout(() => {
        updateDetections(detections, shouldClearRedBlobs);
        overlayUpdateTimeout = null;
    }, 50); // 50ms throttle
});

ipcRenderer.on('finish-build-status', (event, message, type) => {
    // This is the single-line status, but `updateStatus` now handles both.
    // The `finish-build-status-list` IPC will also call updateStatus
    // so that it logs correctly as well.
    // updateStatus(message, type); // This will be handled by finish-build-status-list
});

ipcRenderer.on('finish-build-status-list', (event, history) => {
  // Add new messages to activity log
  history.forEach(item => {
    addLogEntry(item.message, item.type || 'info');
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
        previousLevelDurationDisplay.textContent = durationText;
    }
});

// New: IPC listener for longest level duration updates
ipcRenderer.on('update-longest-level-duration', (event, durationText) => {
    if (longestLevelDurationDisplay) {
        longestLevelDurationDisplay.textContent = durationText;
    }
});

// New: IPC listener for shortest level duration updates
ipcRenderer.on('update-shortest-level-duration', (event, durationText) => {
    if (shortestLevelDurationDisplay) {
        shortestLevelDurationDisplay.textContent = durationText;
    }
});

// New: IPC listener for levels finished count updates
ipcRenderer.on('update-levels-finished-count', (event, count) => {
    if (levelsFinishedCountDisplay) {
        levelsFinishedCountDisplay.textContent = count;
    }
});

// New: IPC listener for average level duration updates
ipcRenderer.on('update-average-level-duration', (event, durationText) => {
    if (averageLevelDurationDisplay) {
        averageLevelDurationDisplay.textContent = durationText;
    }
});

// New: IPC listener for current level name updates
ipcRenderer.on('update-current-level-name', (event, levelName) => {
    if (currentLevelNameDisplay) {
        currentLevelNameDisplay.textContent = levelName || 'Unnamed Level';
    }
});

// New: IPC listener for stage information updates
ipcRenderer.on('update-stage-info', (event, stageInfo) => {
    updateStageDisplay(stageInfo);
});

// IPC listener for longest levels updates
ipcRenderer.on('update-longest-levels', (event, longestLevels) => {
    const longestLevel1 = document.getElementById('longestLevel1');
    const longestLevel2 = document.getElementById('longestLevel2');
    const longestLevel3 = document.getElementById('longestLevel3');
    
    if (longestLevel1) longestLevel1.textContent = longestLevels[0] ? `${longestLevels[0].name} (${formatDuration(longestLevels[0].duration)})` : '—';
    if (longestLevel2) longestLevel2.textContent = longestLevels[1] ? `${longestLevels[1].name} (${formatDuration(longestLevels[1].duration)})` : '—';
    if (longestLevel3) longestLevel3.textContent = longestLevels[2] ? `${longestLevels[2].name} (${formatDuration(longestLevels[2].duration)})` : '—';
});

function formatDuration(durationMs) {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

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
// Stage Display Management
function updateStageDisplay(stageInfo) {
    // Update current stage info in status bar
    const currentStageName = document.getElementById('currentStageName');
    const currentStageProgress = document.getElementById('currentStageProgress');
    const completedStagesCount = document.getElementById('completedStagesCount');
    const averageStageDuration = document.getElementById('averageStageDuration');
    
    if (stageInfo.current && stageInfo.trackingEnabled) {
        if (currentStageName) {
            currentStageName.textContent = stageInfo.current.name;
        }
        if (currentStageProgress) {
            currentStageProgress.textContent = `Level ${stageInfo.current.level}/7`;
        }
    } else {
        if (currentStageName) {
            currentStageName.textContent = stageInfo.trackingEnabled ? 'No Stage' : 'Waiting...';
        }
        if (currentStageProgress) {
            currentStageProgress.textContent = stageInfo.trackingEnabled ? '—' : 'Fresh start needed';
        }
    }
    
    // Update stage statistics
    if (completedStagesCount) {
        completedStagesCount.textContent = stageInfo.completedCount || '0';
    }
    
    if (averageStageDuration) {
        if (stageInfo.averageStageDuration) {
            averageStageDuration.textContent = formatDuration(stageInfo.averageStageDuration);
        } else {
            averageStageDuration.textContent = 'N/A';
        }
    }
    
    // Update longest stages
    updateLongestStages(stageInfo.longestStages || []);
    
    // Show/hide and update current stage details
    updateCurrentStageDetails(stageInfo.current);
    
    // Show/hide and update previous stage
    updatePreviousStageDetails(stageInfo.previous);
}

function updateLongestStages(longestStages) {
    const longestStage1 = document.getElementById('longestStage1');
    const longestStage2 = document.getElementById('longestStage2');
    const longestStage3 = document.getElementById('longestStage3');
    
    const stageElements = [longestStage1, longestStage2, longestStage3];
    
    stageElements.forEach((element, index) => {
        if (element) {
            if (longestStages[index]) {
                const stage = longestStages[index];
                const duration = formatDuration(stage.durationMs);
                element.textContent = `${stage.name}: ${duration}`;
            } else {
                element.textContent = '—';
            }
        }
    });
}

function updateCurrentStageDetails(currentStage) {
    const stageDetails = document.getElementById('stageDetails');
    const stageDetailsTitle = document.getElementById('stageDetailsTitle');
    const stageDuration = document.getElementById('stageDuration');
    const stageLevels = document.getElementById('stageLevels');
    
    if (!currentStage) {
        if (stageDetails) stageDetails.style.display = 'none';
        return;
    }
    
    if (stageDetails) stageDetails.style.display = 'block';
    
    if (stageDetailsTitle) {
        stageDetailsTitle.textContent = `Current Stage: ${currentStage.name}`;
    }
    
    if (stageDuration) {
        const elapsed = Date.now() - currentStage.startTime;
        stageDuration.textContent = formatDuration(elapsed);
    }
    
    if (stageLevels) {
        stageLevels.innerHTML = '';
        
        // Show completed levels
        currentStage.levels.forEach((level, index) => {
            const levelDiv = document.createElement('div');
            levelDiv.className = 'stage-level-item stage-level-completed';
            levelDiv.innerHTML = `
                <span class="stage-level-name">${level.name}</span>
                <span class="stage-level-time">${formatDuration(level.durationMs)}</span>
            `;
            stageLevels.appendChild(levelDiv);
        });
        
        // Show current level placeholder if not at 7 levels
        if (currentStage.levels.length < 7) {
            const currentLevelDiv = document.createElement('div');
            currentLevelDiv.className = 'stage-level-item stage-level-current';
            currentLevelDiv.innerHTML = `
                <span class="stage-level-name">Current Level</span>
                <span class="stage-level-time">In Progress...</span>
            `;
            stageLevels.appendChild(currentLevelDiv);
        }
        
        // Show remaining empty slots
        const remaining = 7 - currentStage.levels.length - (currentStage.levels.length < 7 ? 1 : 0);
        for (let i = 0; i < remaining; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'stage-level-item';
            emptyDiv.innerHTML = `
                <span class="stage-level-name">Level ${currentStage.levels.length + i + 2}</span>
                <span class="stage-level-time">Pending</span>
            `;
            stageLevels.appendChild(emptyDiv);
        }
    }
}

function updatePreviousStageDetails(previousStage) {
    const previousStageDiv = document.getElementById('previousStage');
    const previousStageTitle = document.getElementById('previousStageTitle');
    const previousStageDuration = document.getElementById('previousStageDuration');
    const previousStageLevels = document.getElementById('previousStageLevels');
    
    if (!previousStage) {
        if (previousStageDiv) previousStageDiv.style.display = 'none';
        return;
    }
    
    if (previousStageDiv) previousStageDiv.style.display = 'block';
    
    if (previousStageTitle) {
        previousStageTitle.textContent = `Previous Stage: ${previousStage.name}`;
    }
    
    if (previousStageDuration) {
        previousStageDuration.textContent = formatDuration(previousStage.durationMs);
    }
    
    if (previousStageLevels) {
        previousStageLevels.innerHTML = '';
        
        previousStage.levels.forEach((level, index) => {
            const levelDiv = document.createElement('div');
            levelDiv.className = 'stage-level-item stage-level-completed';
            levelDiv.innerHTML = `
                <span class="stage-level-name">${level.name}</span>
                <span class="stage-level-time">${formatDuration(level.durationMs)}</span>
            `;
            previousStageLevels.appendChild(levelDiv);
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DEBUG: DOMContentLoaded event fired in renderer.js.');
    
    // Initialize activity log first
    initializeActivityLog();
    
    // Initialize overlay system
    initializeOverlay();
    
    // Status messages removed from top-right display

    // Fetch initial region settings (now from main process)
    try {
        console.log('DEBUG: Attempting to fetch initial region settings...');
        currentRegion = await ipcRenderer.invoke('get-capture-region');
        console.log('DEBUG: Initial region settings fetched:', currentRegion);
        // updateStatus('Region settings loaded', 'success'); // Removed - too verbose
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
