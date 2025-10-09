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
const allStatisticsBtn = document.getElementById('allStatisticsBtn');

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

// Stage ETA tracking variables
let currentLevelStartTime = null;
let currentStageInfo = null;
let stageETAUpdateInterval = null;

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
        
        // Show level actions display
        await updateLevelActionsDisplay();
        
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

// All Statistics button event listener
allStatisticsBtn.addEventListener('click', async () => {
    await openStatisticsModal();
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
    // Update the inline timer in the level name display
    const inlineTimer = document.getElementById('currentLevelTimer');
    if (inlineTimer) {
        inlineTimer.textContent = durationText;
    }
    // Also update currentLevelStartTime tracking for ETA calculations
    // Extract milliseconds from durationText (format: "Xm Ys")
    const match = durationText.match(/(\d+)m\s+(\d+)s/);
    if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const elapsedMs = (minutes * 60 + seconds) * 1000;
        currentLevelStartTime = Date.now() - elapsedMs;
    }
    // Update ETAs in real-time
    updateStageETAs();
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
ipcRenderer.on('update-current-level-name', (event, levelName, levelAverageMs, levelBestMs, levelLastMs) => {
    // Toggle compact header depending on name
    try {
        const levelInfo = document.querySelector('.level-info');
        if (levelInfo) {
            if (!levelName || levelName === 'Unknown Level' || levelName === '') {
                levelInfo.classList.add('compact');
            } else {
                levelInfo.classList.remove('compact');
            }
        }
    } catch {}
    if (currentLevelNameDisplay) {
        const name = levelName || 'Unnamed Level';
        
        if (levelAverageMs || levelBestMs) {
            // Format the durations
            const avgText = levelAverageMs ? formatDuration(levelAverageMs) : '—';
            const bestText = levelBestMs ? formatDuration(levelBestMs) : '—';
            const lastText = levelLastMs ? formatDuration(levelLastMs) : '—';
            
            currentLevelNameDisplay.innerHTML = `
                <div style="font-size: 1.6em; font-weight: 700; margin-bottom: 6px; color: #e0e6ed;">${name}</div>
                <div style="font-size: 1em; margin-bottom: 3px;">
                    <span style="color: #ffc107; font-weight: 600;">average:</span> 
                    <span style="color: #e0e6ed; font-weight: 500;">${avgText}</span>
                    <span style="color: #666; margin: 0 8px;">|</span>
                    <span style="color: #4caf50; font-weight: 600;">best:</span> 
                    <span style="color: #e0e6ed; font-weight: 500;">${bestText}</span>
                </div>
                <div style="font-size: 1em;">
                    <span style="color: #9c27b0; font-weight: 600;">last:</span> 
                    <span style="color: #e0e6ed; font-weight: 500; margin-right: 10px;">${lastText}</span>
                    <span style="color: #666; margin: 0 8px;">|</span>
                    <span style="color: #2196f3; font-weight: 600;">current:</span> 
                    <span id="currentLevelTimer" style="color: #e0e6ed; font-weight: 500;">—</span>
                </div>
            `;
        } else {
            currentLevelNameDisplay.textContent = name;
        }
    }
});

// New: IPC listener for stage information updates
ipcRenderer.on('update-stage-info', async (event, stageInfo) => {
    // Store current stage info for ETA calculations
    currentStageInfo = stageInfo;
    
    // Stage pill vs full card
    try {
        const stageInfoBox = document.getElementById('currentStageInfo');
        if (stageInfoBox) {
            if (stageInfo && stageInfo.current && stageInfo.trackingEnabled) {
                stageInfoBox.classList.remove('pill');
            } else {
                stageInfoBox.classList.add('pill');
            }
        }
        // Show/hide records section based on data availability
        const systemStatus = document.querySelector('.system-status');
        if (systemStatus) {
            // Show if we have any meaningful data
            const hasAnyData = !!(stageInfo && (stageInfo.completedCount > 0 || (stageInfo.longestStages && stageInfo.longestStages.length > 0)));
            systemStatus.style.display = hasAnyData ? 'block' : 'none';
        }
    } catch {}
    await updateStageDisplay(stageInfo);
});

// IPC listener for longest levels updates
ipcRenderer.on('update-longest-levels', (event, longestLevels) => {
    const longestLevel1 = document.getElementById('longestLevel1');
    const longestLevel2 = document.getElementById('longestLevel2');
    const longestLevel3 = document.getElementById('longestLevel3');

    if (longestLevel1) longestLevel1.textContent = longestLevels[0] ? `${longestLevels[0].name} (${formatDuration(longestLevels[0].duration)})` : '—';
    if (longestLevel2) longestLevel2.textContent = longestLevels[1] ? `${longestLevels[1].name} (${formatDuration(longestLevels[1].duration)})` : '—';
    if (longestLevel3) longestLevel3.textContent = longestLevels[2] ? `${longestLevels[2].name} (${formatDuration(longestLevels[2].duration)})` : '—';

    // Show records section if we have longest levels data
    const systemStatus = document.querySelector('.system-status');
    if (systemStatus && longestLevels && longestLevels.length > 0) {
        systemStatus.style.display = 'block';
    }
});

function formatDuration(durationMs) {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

// Calculate ETA for completing the current stage (using historical averages for each level)
async function calculateStageETA(currentStage, stageLevelNames) {
    if (!currentStage || !stageLevelNames) return null;
    
    const currentLevelPosition = currentStage.level - 1; // 0-based
    const totalLevels = 7;
    
    if (currentLevelPosition >= totalLevels) return 0; // Stage complete
    
    let totalETA = 0;
    
    // Add ETA for current level (historical avg - elapsed time)
    const currentLevelName = stageLevelNames[currentLevelPosition];
    if (currentLevelName && currentLevelName !== 'N/A') {
        const currentLevelAvg = await ipcRenderer.invoke('get-level-average', currentLevelName);
        if (currentLevelAvg) {
            const currentLevelElapsed = currentLevelStartTime ? Date.now() - currentLevelStartTime : 0;
            const currentLevelETA = Math.max(0, currentLevelAvg - currentLevelElapsed);
            totalETA += currentLevelETA;
        } else {
            return null; // No data for current level
        }
    }
    
    // Add historical averages for remaining levels (skip N/A levels)
    for (let pos = currentLevelPosition + 1; pos < totalLevels; pos++) {
        const levelName = stageLevelNames[pos];
        if (levelName && levelName !== 'N/A') {
            const levelAvg = await ipcRenderer.invoke('get-level-average', levelName);
            if (levelAvg) {
                totalETA += levelAvg;
            } else {
                // If any level has no data, can't calculate accurate ETA
                return null;
            }
        }
    }
    
    return Math.round(totalETA);
}

// Calculate ETA for a specific level position (using historical average for that level)
async function calculateLevelETA(currentStage, levelPosition, levelName) {
    if (!currentStage || !levelName || levelName === 'N/A') return null;
    
    const currentLevelPosition = currentStage.level - 1; // 0-based
    
    if (levelPosition === currentLevelPosition) {
        // For current level: ETA = historical avg - elapsed time
        const levelAvg = await ipcRenderer.invoke('get-level-average', levelName);
        if (!levelAvg) return null;
        
        const currentLevelElapsed = currentLevelStartTime ? Date.now() - currentLevelStartTime : 0;
        return Math.max(0, Math.round(levelAvg - currentLevelElapsed));
    } else if (levelPosition > currentLevelPosition) {
        // For upcoming levels: just return the historical average for that level
        const levelAvg = await ipcRenderer.invoke('get-level-average', levelName);
        return levelAvg ? Math.round(levelAvg) : null;
    }
    
    return null; // Should not happen for completed levels
}

// Update all stage ETAs in real-time (only updates current level ETA as it counts down)
async function updateStageETAs() {
    if (!currentStageInfo || !currentStageInfo.current) return;
    
    // Get level names for the current stage
    let stageLevelNames = [];
    try {
        const levelDatabase = await ipcRenderer.invoke('get-level-database');
        const stageInfo = levelDatabase[currentStageInfo.current.name];
        if (stageInfo && stageInfo.levels) {
            // For stage display, use originalName for first level (if exists), else use name
            stageLevelNames = stageInfo.levels.map(level => 
                (level.position === 1 && level.originalName) ? level.originalName : level.name
            );
        }
    } catch (error) {
        console.error('Failed to load level database for ETA update:', error);
        return;
    }
    
    if (stageLevelNames.length === 0) return;
    
    // Update stage ETA in header
    const currentSummary = document.getElementById('currentStageSummary');
    if (currentSummary && currentStageInfo.current) {
        const a = currentStageInfo.current.historicalAverage ? formatDuration(currentStageInfo.current.historicalAverage) : '—';
        const b = currentStageInfo.current.historicalBest ? formatDuration(currentStageInfo.current.historicalBest) : '—';
        const eta = await calculateStageETA(currentStageInfo.current, stageLevelNames);
        const etaText = eta !== null ? ` • eta: ${formatDuration(eta)}` : '';
        currentSummary.innerHTML = `<div style="font-size: 1.2em; font-weight: 700; margin-bottom: 4px;">Current Stage: ${currentStageInfo.current.name}</div><div style="font-size: 0.85em; color: #a8b2c4;">avg: ${a} • best: ${b}${etaText}</div>`;
    }
    
    // Update ONLY current level ETA (upcoming levels stay at their historical average)
    const stageLevels = document.getElementById('stageLevels');
    if (!stageLevels) return;
    
    const levelItems = stageLevels.querySelectorAll('.stage-level-item');
    const currentLevelPosition = currentStageInfo.current.level - 1;
    
    // Only update the current level's ETA
    if (currentLevelPosition >= 0 && currentLevelPosition < levelItems.length) {
        const currentLevelItem = levelItems[currentLevelPosition];
        const timeSpan = currentLevelItem.querySelector('.stage-level-time');
        const levelName = stageLevelNames[currentLevelPosition];
        
        if (timeSpan && !currentLevelItem.classList.contains('stage-level-completed') && levelName) {
            const eta = await calculateLevelETA(currentStageInfo.current, currentLevelPosition, levelName);
            if (eta !== null) {
                timeSpan.textContent = `eta: ${formatDuration(eta)}`;
            }
        }
    }
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
async function updateStageDisplay(stageInfo) {
    // Update current stage info in status bar
    const currentStageName = document.getElementById('currentStageName');
    const currentStageProgress = document.getElementById('currentStageProgress');
    const completedStagesCount = document.getElementById('completedStagesCount');
    const averageStageDuration = document.getElementById('averageStageDuration');
    
    if (stageInfo.current && stageInfo.trackingEnabled) {
        if (currentStageName) {
            const historicalAvg = stageInfo.current.historicalAverage;
            const historicalBest = stageInfo.current.historicalBest;
            const avgText = historicalAvg ? ` (avg: ${formatDuration(historicalAvg)})` : '';
            const bestText = historicalBest ? ` • best: ${formatDuration(historicalBest)}` : '';
            currentStageName.textContent = stageInfo.current.name + avgText + bestText;
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
    
    // Show/hide and update previous stage levels (compact view)
    await updatePreviousStageDetailsCompact(stageInfo.previous);
    
    // Show/hide and update current stage details
    await updateCurrentStageDetails(stageInfo.current);
    
    // Show/hide and update previous stage (full view - in sidebar)
    updatePreviousStageDetails(stageInfo.previous);

    // Update summaries above stage lists
    const currentSummary = document.getElementById('currentStageSummary');
    if (currentSummary) {
        if (stageInfo.current) {
            const a = stageInfo.current.historicalAverage ? formatDuration(stageInfo.current.historicalAverage) : '—';
            const b = stageInfo.current.historicalBest ? formatDuration(stageInfo.current.historicalBest) : '—';
            
            // Get level names for ETA calculation
            let stageLevelNames = [];
            try {
                const levelDatabase = await ipcRenderer.invoke('get-level-database');
                const stageInfoDb = levelDatabase[stageInfo.current.name];
                if (stageInfoDb && stageInfoDb.levels) {
                    // For stage display, use originalName for first level (if exists), else use name
                    stageLevelNames = stageInfoDb.levels.map(level => 
                        (level.position === 1 && level.originalName) ? level.originalName : level.name
                    );
                }
            } catch (error) {
                console.error('Failed to load level database for stage summary:', error);
            }
            
            const eta = await calculateStageETA(stageInfo.current, stageLevelNames);
            const etaText = eta !== null ? ` • eta: ${formatDuration(eta)}` : '';
            currentSummary.innerHTML = `<div style="font-size: 1.2em; font-weight: 700; margin-bottom: 4px;">Current Stage: ${stageInfo.current.name}</div><div style="font-size: 0.85em; color: #a8b2c4;">avg: ${a} • best: ${b}${etaText}</div>`;
        } else {
            currentSummary.textContent = '';
        }
    }
    const prevSummary = document.getElementById('previousStageSummary');
    if (prevSummary) {
        if (stageInfo.previous) {
            const a = stageInfo.previous.historicalAverage ? formatDuration(stageInfo.previous.historicalAverage) : '—';
            const b = stageInfo.previous.historicalBest ? formatDuration(stageInfo.previous.historicalBest) : '—';
            const l = stageInfo.previous.historicalLast ? formatDuration(stageInfo.previous.historicalLast) : '—';
            prevSummary.innerHTML = `<div style="font-size: 1.2em; font-weight: 700; margin-bottom: 4px;">Previous Stage: ${stageInfo.previous.name}</div><div style="font-size: 0.85em; color: #a8b2c4;">avg: ${a} • best: ${b} • last: ${l}</div>`;
        } else {
            prevSummary.textContent = '';
        }
    }
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

let updateStageCallCounter = 0;

async function updatePreviousStageDetailsCompact(previousStage) {
    const prevStageDetails = document.getElementById('prevStageDetails');
    const prevStageLevels = document.getElementById('prevStageLevels');
    
    if (!previousStage || !previousStage.levels || previousStage.levels.length === 0) {
        if (prevStageDetails) prevStageDetails.style.display = 'none';
        return;
    }
    
    if (prevStageDetails) prevStageDetails.style.display = 'block';
    
    if (prevStageLevels) {
        prevStageLevels.innerHTML = '';
        
        // Get the level database to show actual level names
        let stageLevelNames = [];
        try {
            const levelDatabase = await ipcRenderer.invoke('get-level-database');
            const stageInfo = levelDatabase[previousStage.name];
            if (stageInfo && stageInfo.levels) {
                // For stage display, use originalName for first level (if exists), else use name
                stageLevelNames = stageInfo.levels.map(level => 
                    (level.position === 1 && level.originalName) ? level.originalName : level.name
                );
            }
        } catch (error) {
            console.error('Failed to load level database for previous stage:', error);
        }
        
        // Show all 7 level positions for previous stage (skip N/A)
        for (let position = 0; position < 7; position++) {
            const levelIndex = position;
            const levelName = stageLevelNames[levelIndex] || `Level ${levelIndex + 1}`;
            
            // Skip N/A levels - they don't exist in the game
            if (levelName === 'N/A') {
                console.log(`DEBUG: Skipping N/A level at position ${position} in previous stage`);
                continue;
            }
            
            const levelDiv = document.createElement('div');
            
            if (position < previousStage.levels.length) {
                // Show completed level - use levelName from database (has originalName for position 1)
                const level = previousStage.levels[position];
                levelDiv.className = 'stage-level-item stage-level-completed';
                levelDiv.innerHTML = `
                    <span class="stage-level-name">${levelName}</span>
                    <span class="stage-level-time">${formatDuration(level.durationMs)}</span>
                `;
            } else {
                // Show level name without time (if available)
                levelDiv.className = 'stage-level-item stage-level-incomplete';
                levelDiv.innerHTML = `
                    <span class="stage-level-name">${levelName}</span>
                    <span class="stage-level-time">—</span>
                `;
            }
            
            prevStageLevels.appendChild(levelDiv);
        }
    }
}

async function updateCurrentStageDetails(currentStage) {
    updateStageCallCounter++;
    console.log(`DEBUG: updateCurrentStageDetails called #${updateStageCallCounter}`);
    
    const stageDetails = document.getElementById('stageDetails');
    const stageDetailsTitle = document.getElementById('stageDetailsTitle');
    const stageDuration = document.getElementById('stageDuration');
    const stageLevels = document.getElementById('stageLevels');
    
    if (!currentStage) {
        if (stageDetails) stageDetails.style.display = 'none';
        // Also hide previous stage details when no current stage
        const prevStageDetails = document.getElementById('prevStageDetails');
        if (prevStageDetails) prevStageDetails.style.display = 'none';
        return;
    }
    
    // Debug logging for renderer
    console.log(`DEBUG: Renderer updating stage "${currentStage.name}" with ${currentStage.levels.length} levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
    console.log(`DEBUG: Will show ${currentStage.levels.length} completed + ${currentStage.levels.length < 7 ? 1 : 0} current + ${7 - currentStage.levels.length - (currentStage.levels.length < 7 ? 1 : 0)} upcoming = ${7} total levels`);
    
    if (stageDetails) stageDetails.style.display = 'block';
    
    if (stageDetailsTitle) {
        stageDetailsTitle.textContent = `Current Stage: ${currentStage.name}`;
    }
    
    if (stageDuration) {
        const elapsed = Date.now() - currentStage.startTime;
        stageDuration.textContent = formatDuration(elapsed);
    }
    
    if (stageLevels) {
        console.log(`DEBUG: Clearing stage levels container (was: ${stageLevels.children.length} children)`);
        stageLevels.innerHTML = '';
        let levelItemsAdded = 0;
        
        // Get the level database to show actual level names
        let stageLevelNames = [];
        try {
            const levelDatabase = await ipcRenderer.invoke('get-level-database');
            console.log(`DEBUG: Looking up stage "${currentStage.name}" in level database`);
            const stageInfo = levelDatabase[currentStage.name];
            if (stageInfo && stageInfo.levels) {
                // For stage display, use originalName for first level (if exists), else use name
                stageLevelNames = stageInfo.levels.map(level => 
                    (level.position === 1 && level.originalName) ? level.originalName : level.name
                );
                console.log(`DEBUG: Found ${stageLevelNames.length} levels for "${currentStage.name}": [${stageLevelNames.join(', ')}]`);
            } else {
                console.log(`DEBUG: No stage info found for "${currentStage.name}" in database. Available stages: [${Object.keys(levelDatabase).slice(0, 5).join(', ')}...]`);
            }
        } catch (error) {
            console.error('Failed to load level database:', error);
        }
        
        // Show all 7 level positions, inserting current level placeholder at the correct position
        const currentLevelPosition = currentStage.level - 1; // Convert to 0-based position
        console.log(`DEBUG: Current stage level: ${currentStage.level}, position: ${currentLevelPosition}, completed levels: ${currentStage.levels.length}`);
        console.log(`DEBUG: Completed levels: [${currentStage.levels.map(l => `${l.name}(${formatDuration(l.durationMs)})`).join(', ')}]`);
        
        for (let position = 0; position < 7; position++) {
            const levelIndex = position;
            const levelName = stageLevelNames[levelIndex] || `Level ${levelIndex + 1}`;
            
            // Skip N/A levels - they don't exist in the game
            if (levelName === 'N/A') {
                console.log(`DEBUG: Skipping N/A level at position ${position}`);
                continue;
            }
            
            const levelDiv = document.createElement('div');
            
            // Check if there's a completed level at this position (levels are stored in order)
            if (position < currentStage.levels.length) {
                // Show completed level - use levelName from database (has originalName for position 1)
                const level = currentStage.levels[position];
                levelDiv.className = 'stage-level-item stage-level-completed';
                levelDiv.innerHTML = `
                    <span class="stage-level-name">${levelName}</span>
                    <span class="stage-level-time">${formatDuration(level.durationMs)}</span>
                `;
                levelItemsAdded++;
                console.log(`DEBUG: Added completed level #${levelItemsAdded} at position ${position}: ${levelName} (${formatDuration(level.durationMs)})`);
            } else if (position === currentLevelPosition) {
                // Show current level with actual name and ETA
                levelDiv.className = 'stage-level-item stage-level-current';
                
                // Calculate ETA for current level (historical avg - elapsed time)
                const eta = await calculateLevelETA(currentStage, position, levelName);
                const etaText = eta !== null ? `eta: ${formatDuration(eta)}` : 'Calculating...';
                
                levelDiv.innerHTML = `
                    <span class="stage-level-name">${levelName}</span>
                    <span class="stage-level-time">${etaText}</span>
                `;
                levelItemsAdded++;
                console.log(`DEBUG: Added current level #${levelItemsAdded} at position ${position}: ${levelName} (${etaText})`);
            } else {
                // Show upcoming level with historical average as static ETA
                levelDiv.className = 'stage-level-item';
                
                // Get historical average for this specific level (static, doesn't count down)
                const eta = await calculateLevelETA(currentStage, position, levelName);
                const etaText = eta !== null ? `eta: ${formatDuration(eta)}` : '—';
                
                levelDiv.innerHTML = `
                    <span class="stage-level-name">${levelName}</span>
                    <span class="stage-level-time">${etaText}</span>
                `;
                levelItemsAdded++;
                console.log(`DEBUG: Added upcoming level #${levelItemsAdded} at position ${position}: ${levelName} (${etaText})`);
            }
            
            stageLevels.appendChild(levelDiv);
        }
        
        console.log(`DEBUG: Total level items added: ${levelItemsAdded}, Final DOM children count: ${stageLevels.children.length}`);
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
        const historicalAvg = previousStage.historicalAverage;
        const avgText = historicalAvg ? ` (avg: ${formatDuration(historicalAvg)})` : '';
        previousStageTitle.textContent = `Previous Stage: ${previousStage.name}${avgText}`;
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

// Statistics Modal Functions
let statisticsData = {
    stages: {},
    levels: {}
};

// Sorting state for bidirectional sorting
let sortingState = {
    stages: { column: 'number', direction: 'asc' },
    levels: { column: 'name', direction: 'asc' }
};

async function openStatisticsModal() {
    // Load statistics data
    await loadStatisticsData();
    
    // Show modal
    const modal = document.getElementById('statisticsModal');
    modal.style.display = 'flex';
    
    // Setup event listeners
    setupStatisticsModalListeners();
    
    // Populate initial data
    populateStagesView();
    populateLevelsView();
}

async function loadStatisticsData() {
    try {
        const stats = await ipcRenderer.invoke('get-historical-stats');
        const levelDb = await ipcRenderer.invoke('get-level-database');
        
        statisticsData.stages = stats.stages || {};
        statisticsData.levels = stats.levels || {};
        statisticsData.levelDatabase = levelDb;
        
        console.log('Loaded statistics data:', statisticsData);
    } catch (error) {
        console.error('Error loading statistics data:', error);
        statisticsData = { stages: {}, levels: {} };
    }
}

function setupStatisticsModalListeners() {
    const modal = document.getElementById('statisticsModal');
    const closeBtn = document.getElementById('closeStatisticsBtn');
    const stagesTab = document.getElementById('stagesTab');
    const levelsTab = document.getElementById('levelsTab');
    const stageSort = document.getElementById('stageSort');
    const levelSort = document.getElementById('levelSort');
    const ignoreExtremes = document.getElementById('ignoreExtremes');
    const ignoreExtremesLevels = document.getElementById('ignoreExtremesLevels');
    
    // Close modal
    closeBtn.onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };
    
    // Tab switching
    stagesTab.onclick = () => switchToTab('stages');
    levelsTab.onclick = () => switchToTab('levels');
    
    // Sort changes
    stageSort.onchange = () => populateStagesView();
    levelSort.onchange = () => populateLevelsView();
    ignoreExtremes.onchange = () => populateStagesView();
    ignoreExtremesLevels.onchange = () => populateLevelsView();
    
    // Table header click sorting
    setupTableSorting();
}

function setupTableSorting() {
    console.log('DEBUG: setupTableSorting called');
    // Setup stages table sorting
    const stagesTable = document.getElementById('stagesTable');
    if (stagesTable) {
        console.log('DEBUG: Found stages table, setting up sorting');
        const stageHeaders = stagesTable.querySelectorAll('th.sortable');
        stageHeaders.forEach(header => {
            header.onclick = () => {
                const sortBy = header.getAttribute('data-sort');
                console.log(`DEBUG: Stages table header clicked - sortBy: ${sortBy}`);
                
                // Toggle direction if same column, otherwise reset to ascending
                if (sortingState.stages.column === sortBy) {
                    sortingState.stages.direction = sortingState.stages.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    sortingState.stages.column = sortBy;
                    sortingState.stages.direction = 'asc';
                }
                
                console.log(`DEBUG: Stages sorting state - column: ${sortingState.stages.column}, direction: ${sortingState.stages.direction}`);
                
                // Update visual indicators
                updateSortIndicators('stages', sortBy, sortingState.stages.direction);
                
                // Update dropdown and repopulate
                document.getElementById('stageSort').value = sortBy;
                populateStagesView();
            };
        });
    }
    
    // Setup levels table sorting
    const levelsTable = document.getElementById('levelsTable');
    if (levelsTable) {
        console.log('DEBUG: Found levels table, setting up sorting');
        const levelHeaders = levelsTable.querySelectorAll('th.sortable');
        levelHeaders.forEach(header => {
            header.onclick = () => {
                const sortBy = header.getAttribute('data-sort');
                
                // Toggle direction if same column, otherwise reset to ascending
                if (sortingState.levels.column === sortBy) {
                    sortingState.levels.direction = sortingState.levels.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    sortingState.levels.column = sortBy;
                    sortingState.levels.direction = 'asc';
                }
                
                // Update visual indicators
                updateSortIndicators('levels', sortBy, sortingState.levels.direction);
                
                // Update dropdown and repopulate
                document.getElementById('levelSort').value = sortBy;
                populateLevelsView();
            };
        });
    }
}

function updateSortIndicators(table, activeColumn, direction) {
    const tableElement = document.getElementById(table === 'stages' ? 'stagesTable' : 'levelsTable');
    if (!tableElement) return;
    
    // Remove all existing sort indicators
    const headers = tableElement.querySelectorAll('th.sortable');
    headers.forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) indicator.remove();
    });
    
    // Add indicator to active column
    const activeHeader = tableElement.querySelector(`th[data-sort="${activeColumn}"]`);
    if (activeHeader) {
        activeHeader.classList.add(`sort-${direction}`);
        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        indicator.textContent = direction === 'asc' ? ' ↑' : ' ↓';
        activeHeader.appendChild(indicator);
    }
}

function calculateTrend(completions) {
    if (!completions || completions.length < 2) {
        return { direction: 'neutral', text: '—' };
    }
    
    // Calculate trend by comparing first half vs second half
    const midPoint = Math.floor(completions.length / 2);
    const firstHalf = completions.slice(0, midPoint);
    const secondHalf = completions.slice(midPoint);
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (Math.abs(percentChange) < 5) {
        return { direction: 'neutral', text: '→' };
    } else if (percentChange > 0) {
        return { direction: 'up', text: '↗' };
    } else {
        return { direction: 'down', text: '↘' };
    }
}

function switchToTab(tab) {
    const stagesTab = document.getElementById('stagesTab');
    const levelsTab = document.getElementById('levelsTab');
    const stagesView = document.getElementById('stagesView');
    const levelsView = document.getElementById('levelsView');
    
    if (tab === 'stages') {
        stagesTab.classList.add('active');
        levelsTab.classList.remove('active');
        stagesView.classList.add('active');
        levelsView.classList.remove('active');
    } else {
        levelsTab.classList.add('active');
        stagesTab.classList.remove('active');
        levelsView.classList.add('active');
        stagesView.classList.remove('active');
    }
}

function populateStagesView() {
    const tbody = document.getElementById('stagesTableBody');
    const sortBy = document.getElementById('stageSort').value;
    const ignoreExtremes = document.getElementById('ignoreExtremes').checked;
    
    // Get all 60 stages from database
    const allStages = [];
    if (statisticsData.levelDatabase) {
        Object.entries(statisticsData.levelDatabase).forEach(([stageName, stageInfo]) => {
            // Try multiple ways to find stage stats (case insensitive, exact match, etc.)
            let stageStats = statisticsData.stages[stageName] || 
                           statisticsData.stages[stageName.toLowerCase()] ||
                           statisticsData.stages[stageName.replace(/\s+/g, ' ').trim()] ||
                           {};
            
            console.log(`Looking for stage "${stageName}" in stats:`, Object.keys(statisticsData.stages));
            console.log(`Found stats for "${stageName}":`, stageStats);
            
            const completions = stageStats.completions || [];
            const filteredCompletions = ignoreExtremes ? filterExtremes(completions) : completions;
            
            allStages.push({
                name: stageName,
                number: stageInfo.stageNumber,
                completions: completions.length,
                last: completions.length > 0 ? completions[completions.length - 1] : 0,
                average: filteredCompletions.length > 0 ? Math.round(filteredCompletions.reduce((a, b) => a + b, 0) / filteredCompletions.length) : 0,
                min: filteredCompletions.length > 0 ? Math.min(...filteredCompletions) : 0,
                max: filteredCompletions.length > 0 ? Math.max(...filteredCompletions) : 0,
                trend: calculateTrend(completions)
            });
        });
    }
    
    // Sort stages
    allStages.sort((a, b) => {
        let result = 0;
        const currentSort = sortingState.stages.column;
        
        switch (currentSort) {
            case 'name': 
                result = a.name.localeCompare(b.name);
                break;
            case 'number': 
                result = a.number - b.number;
                break;
            case 'last':
            case 'average': 
            case 'min':
            case 'max':
                // Handle time-based sorting (0 values go to end)
                const aVal = a[currentSort] || 0;
                const bVal = b[currentSort] || 0;
                if (aVal === 0 && bVal === 0) result = 0;
                else if (aVal === 0) result = 1;
                else if (bVal === 0) result = -1;
                else result = aVal - bVal;
                break;
            case 'count': 
                result = a.completions - b.completions;
                break;
            case 'trend':
                // Sort by trend direction: down < neutral < up
                const trendOrder = { 'down': 0, 'neutral': 1, 'up': 2 };
                console.log(`DEBUG: Sorting stages trend - a: ${a.trend.direction}, b: ${b.trend.direction}`);
                result = trendOrder[a.trend.direction] - trendOrder[b.trend.direction];
                break;
            default: 
                result = a.number - b.number;
        }
        
        // Apply direction
        return sortingState.stages.direction === 'desc' ? -result : result;
    });
    
    // Populate table
    tbody.innerHTML = allStages.map(stage => `
        <tr>
            <td>${stage.name}</td>
            <td>${stage.number}</td>
            <td>${stage.completions || '<span class="no-data">0</span>'}</td>
            <td>${stage.last ? formatDuration(stage.last) : '<span class="no-data">—</span>'}</td>
            <td>${stage.average ? formatDuration(stage.average) : '<span class="no-data">—</span>'}</td>
            <td>${stage.min ? formatDuration(stage.min) : '<span class="no-data">—</span>'}</td>
            <td>${stage.max ? formatDuration(stage.max) : '<span class="no-data">—</span>'}</td>
            <td class="trend-${stage.trend.direction}">${stage.trend.text}</td>
        </tr>
    `).join('');
    
    // Re-setup table sorting after populating
    setupTableSorting();
    
    // Update sort indicators
    updateSortIndicators('stages', sortingState.stages.column, sortingState.stages.direction);
}

function populateLevelsView() {
    const tbody = document.getElementById('levelsTableBody');
    const sortBy = document.getElementById('levelSort').value;
    const ignoreExtremes = document.getElementById('ignoreExtremesLevels').checked;
    
    // Get all levels from statistics
    const allLevels = [];
    Object.entries(statisticsData.levels).forEach(([levelName, levelStats]) => {
        const completions = levelStats.completions || [];
        const filteredCompletions = ignoreExtremes ? filterExtremes(completions) : completions;
        
        // Find positions where this level appears
        const positions = [];
        if (statisticsData.levelDatabase) {
            Object.values(statisticsData.levelDatabase).forEach(stage => {
                stage.levels.forEach((level, index) => {
                    const actualLevelName = level.originalName || level.name;
                    if (actualLevelName === levelName) {
                        positions.push(index + 1); // Convert 0-based to 1-based
                    }
                });
            });
        }
        
        // Remove duplicates and sort
        const uniquePositions = [...new Set(positions)].sort((a, b) => a - b);
        const positionsText = uniquePositions.length > 0 ? uniquePositions.join(',') : '—';
        
        allLevels.push({
            name: levelName,
            positions: uniquePositions,
            positionsText: positionsText,
            completions: completions.length,
            last: completions.length > 0 ? completions[completions.length - 1] : 0,
            average: filteredCompletions.length > 0 ? Math.round(filteredCompletions.reduce((a, b) => a + b, 0) / filteredCompletions.length) : 0,
            min: filteredCompletions.length > 0 ? Math.min(...filteredCompletions) : 0,
            max: filteredCompletions.length > 0 ? Math.max(...filteredCompletions) : 0,
            trend: calculateTrend(completions)
        });
    });
    
    // Sort levels
    allLevels.sort((a, b) => {
        let result = 0;
        const currentSort = sortingState.levels.column;
        
        switch (currentSort) {
            case 'name': 
                result = a.name.localeCompare(b.name);
                break;
            case 'positions': 
                // Sort by first position, handle empty positions
                const aPos = a.positions.length > 0 ? a.positions[0] : 999;
                const bPos = b.positions.length > 0 ? b.positions[0] : 999;
                result = aPos - bPos;
                break;
            case 'last':
            case 'average': 
            case 'min':
            case 'max':
                // Handle time-based sorting (0 values go to end)
                const aVal = a[currentSort] || 0;
                const bVal = b[currentSort] || 0;
                if (aVal === 0 && bVal === 0) result = 0;
                else if (aVal === 0) result = 1;
                else if (bVal === 0) result = -1;
                else result = aVal - bVal;
                break;
            case 'count': 
                result = a.completions - b.completions;
                break;
            case 'trend':
                // Sort by trend direction: down < neutral < up
                const trendOrder = { 'down': 0, 'neutral': 1, 'up': 2 };
                console.log(`DEBUG: Sorting levels trend - a: ${a.trend.direction}, b: ${b.trend.direction}`);
                result = trendOrder[a.trend.direction] - trendOrder[b.trend.direction];
                break;
            default: 
                result = a.name.localeCompare(b.name);
        }
        
        // Apply direction
        return sortingState.levels.direction === 'desc' ? -result : result;
    });
    
    // Populate table
    tbody.innerHTML = allLevels.map(level => `
        <tr>
            <td>${level.name}</td>
            <td>${level.positionsText}</td>
            <td>${level.completions || '<span class="no-data">0</span>'}</td>
            <td>${level.last ? formatDuration(level.last) : '<span class="no-data">—</span>'}</td>
            <td>${level.average ? formatDuration(level.average) : '<span class="no-data">—</span>'}</td>
            <td>${level.min ? formatDuration(level.min) : '<span class="no-data">—</span>'}</td>
            <td>${level.max ? formatDuration(level.max) : '<span class="no-data">—</span>'}</td>
            <td class="trend-${level.trend.direction}">${level.trend.text}</td>
        </tr>
    `).join('');
    
    // Re-setup table sorting after populating
    setupTableSorting();
    
    // Update sort indicators
    updateSortIndicators('levels', sortingState.levels.column, sortingState.levels.direction);
}

function filterExtremes(data) {
    if (data.length < 10) return data; // Need at least 10 data points
    
    const sorted = [...data].sort((a, b) => a - b);
    const removeCount = Math.floor(data.length * 0.1); // Remove 10% from each end
    
    return sorted.slice(removeCount, -removeCount);
}

function calculateTrend(data) {
    if (data.length < 5) return { direction: 'stable', text: '—' };
    
    const recent = data.slice(-5);
    const older = data.slice(-10, -5);
    
    if (older.length === 0) return { direction: 'stable', text: '—' };
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (Math.abs(change) < 5) return { direction: 'stable', text: '→' };
    if (change > 0) return { direction: 'up', text: '↗' };
    return { direction: 'down', text: '↘' };
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
    
    // Initialize settings modal
    initializeSettingsModal();
    
    // Apply compact header and pill stage look initially
    try {
        const levelInfo = document.querySelector('.level-info');
        if (levelInfo) levelInfo.classList.add('compact');
        const stageInfo = document.getElementById('currentStageInfo');
        if (stageInfo) stageInfo.classList.add('pill');
        const systemStatus = document.querySelector('.system-status');
        if (systemStatus) systemStatus.style.display = 'none';
    } catch (e) { console.warn('Header compact styling failed to init', e); }

    console.log('DEBUG: DOMContentLoaded handler finished.');
});

// Settings Modal Implementation
let allLevelNames = [];
let currentEditingLevel = '';
let originalSettings = null; // Track original settings to detect changes

async function initializeSettingsModal() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const levelSelect = document.getElementById('levelSelect');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const resetToDefaultsBtn = document.getElementById('resetToDefaultsBtn');
    
    // Get all level names
    allLevelNames = await ipcRenderer.invoke('get-all-level-names');
    
    // Sort level names alphabetically
    const sortedLevelNames = [...allLevelNames].sort((a, b) => a.localeCompare(b));
    
    // Populate level selector
    sortedLevelNames.forEach(levelName => {
        const option = document.createElement('option');
        option.value = levelName;
        option.textContent = levelName.charAt(0).toUpperCase() + levelName.slice(1);
        levelSelect.appendChild(option);
    });
    
    // Open modal
    settingsBtn.addEventListener('click', async () => {
        // Get current level or use first in list
        const currentLevel = await ipcRenderer.invoke('get-current-level-name');
        if (currentLevel && currentLevel !== 'Unknown Level' && currentLevel !== '') {
            levelSelect.value = currentLevel.toLowerCase();
        } else {
            levelSelect.value = '';
        }
        
        await loadSettingsForLevel(levelSelect.value || currentLevel.toLowerCase());
        settingsModal.style.display = 'flex';
    });
    
    // Close modal
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });
    
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });
    
    // Level change
    levelSelect.addEventListener('change', async (e) => {
        await loadSettingsForLevel(e.target.value);
    });
    
    // Save settings
    saveSettingsBtn.addEventListener('click', async () => {
        await saveCurrentSettings();
    });
    
    // Reset to defaults
    resetToDefaultsBtn.addEventListener('click', async () => {
        if (confirm('Reset this level to default settings?')) {
            await resetLevelToDefaults();
        }
    });
    
    // Show/hide options based on action selection
    document.getElementById('firstBuildAction').addEventListener('change', (e) => {
        document.getElementById('firstBuildClickaroundOptions').style.display = 
            e.target.value === 'clickaround' ? 'block' : 'none';
        document.getElementById('firstBuildClickOffScrollDistance').parentElement.style.display = 
            e.target.value === 'click_off_and_scroll' ? 'block' : 'none';
        checkForChanges();
    });
    
    document.getElementById('secondBuildAction').addEventListener('change', (e) => {
        document.getElementById('secondBuildClickaroundOptions').style.display = 
            e.target.value === 'clickaround' ? 'block' : 'none';
        document.getElementById('secondBuildClickOffScrollDistance').parentElement.style.display = 
            e.target.value === 'click_off_and_scroll' ? 'block' : 'none';
        checkForChanges();
    });
    
    // Add change listeners to all form inputs to track modifications
    const formInputs = [
        'doResearch', 'scrollDirection', 'blueBoxClickHoldDuration',
        'scrollToBottomAfterFirstBuild', 'scrollToBottomAfterSecondBuild', 'perfectStartingPosition',
        'firstBuildAction', 'firstBuildTriggerTime', 'firstBuildClickOffScrollDistance',
        'firstBuildExcludeRedBlobs', 'firstBuildClickaroundChunks', 'firstBuildScrollUpDistance', 'firstBuildScrollUpCount',
        'firstBuildInitialScrollDown', 'firstBuildScrollToBottomAtEnd',
        'secondBuildAction', 'secondBuildTriggerTime', 'secondBuildClickOffScrollDistance',
        'secondBuildExcludeRedBlobs', 'secondBuildClickaroundChunks', 'secondBuildScrollUpDistance', 'secondBuildScrollUpCount',
        'secondBuildInitialScrollDown', 'secondBuildScrollToBottomAtEnd'
    ];
    
    formInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', checkForChanges);
            element.addEventListener('input', checkForChanges);
        }
    });
}

function checkForChanges() {
    if (!originalSettings) return;
    
    const saveBtn = document.getElementById('saveSettingsBtn');
    
    // Get current form values
    const currentValues = getCurrentFormSettings();
    
    // Compare with original settings
    const hasChanges = JSON.stringify(currentValues) !== JSON.stringify(originalSettings);
    
    // Enable/disable save button
    if (hasChanges) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
    } else {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
        saveBtn.style.cursor = 'not-allowed';
    }
}

function getCurrentFormSettings() {
    const firstBuildAction = document.getElementById('firstBuildAction').value;
    const secondBuildAction = document.getElementById('secondBuildAction').value;
    
    return {
        doResearch: document.getElementById('doResearch').checked,
        scrollDirection: document.getElementById('scrollDirection').value,
        blueBoxClickHoldDuration: parseInt(document.getElementById('blueBoxClickHoldDuration').value),
        scrollToBottomAfterFirstBuild: document.getElementById('scrollToBottomAfterFirstBuild').checked,
        scrollToBottomAfterSecondBuild: document.getElementById('scrollToBottomAfterSecondBuild').checked,
        perfectStartingPosition: document.getElementById('perfectStartingPosition').value,
        firstBuildAction: {
            action: firstBuildAction,
            triggerTimeMs: parseInt(document.getElementById('firstBuildTriggerTime').value) || null,
            clickOffAndScrollDistance: parseInt(document.getElementById('firstBuildClickOffScrollDistance').value) || 150,
            clickaroundOptions: firstBuildAction === 'clickaround' ? {
                excludeRedBlobs: document.getElementById('firstBuildExcludeRedBlobs').checked,
                clickaroundChunks: parseInt(document.getElementById('firstBuildClickaroundChunks').value) ?? 3,
                scrollUpDistance: parseInt(document.getElementById('firstBuildScrollUpDistance').value) ?? 200,
                scrollUpCount: parseInt(document.getElementById('firstBuildScrollUpCount').value) ?? 5,
                initialScrollDown: parseInt(document.getElementById('firstBuildInitialScrollDown').value) ?? 150,
                scrollToBottomAtEnd: document.getElementById('firstBuildScrollToBottomAtEnd').checked
            } : {}
        },
        secondBuildAction: {
            action: secondBuildAction,
            triggerTimeMs: parseInt(document.getElementById('secondBuildTriggerTime').value) || null,
            clickOffAndScrollDistance: parseInt(document.getElementById('secondBuildClickOffScrollDistance').value) || 150,
            clickaroundOptions: secondBuildAction === 'clickaround' ? {
                excludeRedBlobs: document.getElementById('secondBuildExcludeRedBlobs').checked,
                clickaroundChunks: parseInt(document.getElementById('secondBuildClickaroundChunks').value) ?? 3,
                scrollUpDistance: parseInt(document.getElementById('secondBuildScrollUpDistance').value) ?? 200,
                scrollUpCount: parseInt(document.getElementById('secondBuildScrollUpCount').value) ?? 5,
                initialScrollDown: parseInt(document.getElementById('secondBuildInitialScrollDown').value) ?? 150,
                scrollToBottomAtEnd: document.getElementById('secondBuildScrollToBottomAtEnd').checked
            } : {}
        }
    };
}

async function loadSettingsForLevel(levelName) {
    if (!levelName) {
        const currentLevel = await ipcRenderer.invoke('get-current-level-name');
        levelName = currentLevel.toLowerCase();
    }
    
    currentEditingLevel = levelName;
    
    // Show which level we're editing
    const displayName = levelName.charAt(0).toUpperCase() + levelName.slice(1);
    document.getElementById('currentLevelDisplay').textContent = `Editing: ${displayName}`;
    
    // Get settings for this level
    const settings = await ipcRenderer.invoke('get-level-settings', levelName);
    
    // Populate form
    document.getElementById('doResearch').checked = settings.doResearch;
    document.getElementById('scrollDirection').value = settings.scrollDirection;
    document.getElementById('blueBoxClickHoldDuration').value = settings.blueBoxClickHoldDuration;
    document.getElementById('scrollToBottomAfterFirstBuild').checked = settings.scrollToBottomAfterFirstBuild;
    document.getElementById('scrollToBottomAfterSecondBuild').checked = settings.scrollToBottomAfterSecondBuild;
    document.getElementById('perfectStartingPosition').value = settings.perfectStartingPosition;
    
    // First build action
    document.getElementById('firstBuildAction').value = settings.firstBuildAction.action;
    document.getElementById('firstBuildTriggerTime').value = settings.firstBuildAction.triggerTimeMs || '';
    document.getElementById('firstBuildClickOffScrollDistance').value = settings.firstBuildAction.clickOffAndScrollDistance || 150;
    
    // First build clickaround options
    const firstClickaroundOpts = settings.firstBuildAction.clickaroundOptions || {};
    document.getElementById('firstBuildExcludeRedBlobs').checked = 
        firstClickaroundOpts.excludeRedBlobs !== undefined ? firstClickaroundOpts.excludeRedBlobs : true;
    document.getElementById('firstBuildClickaroundChunks').value = firstClickaroundOpts.clickaroundChunks ?? 3;
    document.getElementById('firstBuildScrollUpDistance').value = firstClickaroundOpts.scrollUpDistance ?? 200;
    document.getElementById('firstBuildScrollUpCount').value = firstClickaroundOpts.scrollUpCount ?? 5;
    document.getElementById('firstBuildInitialScrollDown').value = firstClickaroundOpts.initialScrollDown ?? 150;
    document.getElementById('firstBuildScrollToBottomAtEnd').checked = 
        firstClickaroundOpts.scrollToBottomAtEnd !== undefined ? firstClickaroundOpts.scrollToBottomAtEnd : false;
    document.getElementById('firstBuildClickaroundOptions').style.display = 
        settings.firstBuildAction.action === 'clickaround' ? 'block' : 'none';
    document.getElementById('firstBuildClickOffScrollDistance').parentElement.style.display = 
        settings.firstBuildAction.action === 'click_off_and_scroll' ? 'block' : 'none';
    
    // Second build action
    document.getElementById('secondBuildAction').value = settings.secondBuildAction.action;
    document.getElementById('secondBuildTriggerTime').value = settings.secondBuildAction.triggerTimeMs || '';
    document.getElementById('secondBuildClickOffScrollDistance').value = settings.secondBuildAction.clickOffAndScrollDistance || 150;
    
    // Second build clickaround options
    const secondClickaroundOpts = settings.secondBuildAction.clickaroundOptions || {};
    document.getElementById('secondBuildExcludeRedBlobs').checked = 
        secondClickaroundOpts.excludeRedBlobs !== undefined ? secondClickaroundOpts.excludeRedBlobs : true;
    document.getElementById('secondBuildClickaroundChunks').value = secondClickaroundOpts.clickaroundChunks ?? 3;
    document.getElementById('secondBuildScrollUpDistance').value = secondClickaroundOpts.scrollUpDistance ?? 200;
    document.getElementById('secondBuildScrollUpCount').value = secondClickaroundOpts.scrollUpCount ?? 5;
    document.getElementById('secondBuildInitialScrollDown').value = secondClickaroundOpts.initialScrollDown ?? 150;
    document.getElementById('secondBuildScrollToBottomAtEnd').checked = 
        secondClickaroundOpts.scrollToBottomAtEnd !== undefined ? secondClickaroundOpts.scrollToBottomAtEnd : false;
    document.getElementById('secondBuildClickaroundOptions').style.display = 
        settings.secondBuildAction.action === 'clickaround' ? 'block' : 'none';
    document.getElementById('secondBuildClickOffScrollDistance').parentElement.style.display = 
        settings.secondBuildAction.action === 'click_off_and_scroll' ? 'block' : 'none';
    
    // Store original settings for change detection
    originalSettings = getCurrentFormSettings();
    
    // Disable save button initially (no changes yet)
    const saveBtn = document.getElementById('saveSettingsBtn');
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.5';
    saveBtn.style.cursor = 'not-allowed';
}

async function saveCurrentSettings() {
    const settings = getCurrentFormSettings();
    
    const result = await ipcRenderer.invoke('save-level-settings', currentEditingLevel, settings);
    
    if (result.success) {
        // Update original settings to match current (no changes now)
        originalSettings = getCurrentFormSettings();
        
        // Disable save button (settings are now saved)
        const saveBtn = document.getElementById('saveSettingsBtn');
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
        saveBtn.style.cursor = 'not-allowed';
        
        // Update level actions display if this is the current level
        await updateLevelActionsDisplay();
        
        console.log(`Settings saved for ${currentEditingLevel}`);
    } else {
        alert(`Error saving settings: ${result.error}`);
    }
}

async function resetLevelToDefaults() {
    const result = await ipcRenderer.invoke('reset-level-to-defaults', currentEditingLevel);
    
    if (result.success) {
        alert(`${currentEditingLevel} reset to defaults!`);
        await loadSettingsForLevel(currentEditingLevel);
        await updateLevelActionsDisplay();
    } else {
        alert(`Error resetting: ${result.error}`);
    }
}

// Level Actions Display
async function updateLevelActionsDisplay() {
    const currentLevel = await ipcRenderer.invoke('get-current-level-name');
    
    if (!currentLevel || currentLevel === 'Unknown Level' || currentLevel === '') {
        document.getElementById('levelActionsDisplay').style.display = 'none';
        return;
    }
    
    const settings = await ipcRenderer.invoke('get-level-settings', currentLevel.toLowerCase());
    const actionsDisplay = document.getElementById('levelActionsDisplay');
    
    actionsDisplay.style.display = 'block';
    
    // Reset all checkboxes
    ['actionStartup', 'actionFirstBuild', 'actionAfterFirstBuild', 'actionSecondBuild', 'actionAfterSecondBuild'].forEach(id => {
        const element = document.getElementById(id);
        const checkbox = element.querySelector('.action-checkbox');
        checkbox.textContent = '☐';
        checkbox.classList.remove('checked');
    });
    
    // Update Startup value
    document.getElementById('startupValue').textContent = 
        settings.perfectStartingPosition === 'nothing' ? 'None' : 
        settings.perfectStartingPosition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // Helper function to check if clickaround options are modified
    const isClickaroundModified = (options) => {
        if (!options) return false;
        const defaults = {
            excludeRedBlobs: true,
            scrollUpDistance: 200,
            scrollUpCount: 5,
            initialScrollDown: 150,
            scrollToBottomAtEnd: true
        };
        return Object.keys(defaults).some(key => options[key] !== defaults[key]);
    };
    
    // Update First Build value
    if (settings.firstBuildAction.action === 'nothing') {
        document.getElementById('firstBuildValue').textContent = 'None';
    } else if (settings.firstBuildAction.action === 'clickaround') {
        const modifier = isClickaroundModified(settings.firstBuildAction.clickaroundOptions) ? '(M)' : '(D)';
        document.getElementById('firstBuildValue').textContent = 
            `clickaround ${modifier} @ ${(settings.firstBuildAction.triggerTimeMs / 1000)}s`;
    } else {
        document.getElementById('firstBuildValue').textContent = 
            `${settings.firstBuildAction.action} @ ${(settings.firstBuildAction.triggerTimeMs / 1000)}s`;
    }
    
    // Update After First Build value
    document.getElementById('afterFirstBuildValue').textContent = 
        settings.scrollToBottomAfterFirstBuild ? 'Scroll to Bottom' : 'None';
    
    // Update Second Build value
    if (settings.secondBuildAction.action === 'nothing') {
        document.getElementById('secondBuildValue').textContent = 'None';
    } else if (settings.secondBuildAction.action === 'clickaround') {
        const modifier = isClickaroundModified(settings.secondBuildAction.clickaroundOptions) ? '(M)' : '(D)';
        document.getElementById('secondBuildValue').textContent = 
            `clickaround ${modifier} @ ${(settings.secondBuildAction.triggerTimeMs / 1000)}s`;
    } else {
        document.getElementById('secondBuildValue').textContent = 
            `${settings.secondBuildAction.action} @ ${(settings.secondBuildAction.triggerTimeMs / 1000)}s`;
    }
    
    // Update After Second Build value
    document.getElementById('afterSecondBuildValue').textContent = 
        settings.scrollToBottomAfterSecondBuild ? 'Scroll to Bottom' : 'None';
    
    // Update other settings
    document.getElementById('researchValue').textContent = settings.doResearch ? 'Yes' : 'No';
    document.getElementById('holdDurationValue').textContent = `${settings.blueBoxClickHoldDuration / 1000}s`;
    document.getElementById('scrollDirValue').textContent = settings.scrollDirection === 'up' ? 'Up ↑' : 'Down ↓';
    
    console.log('✨ Level actions display updated and visible');
}

// Listen for level name changes to update actions display
ipcRenderer.on('update-current-level-name', async () => {
    await updateLevelActionsDisplay();
});

// Listen for action completion events to update checkmarks
ipcRenderer.on('level-action-completed', (event, actionType) => {
    console.log(`🔔 Received level-action-completed event: ${actionType}`);
    
    const actionMap = {
        'startup': 'actionStartup',
        'first_build': 'actionFirstBuild',
        'after_first_build': 'actionAfterFirstBuild',
        'second_build': 'actionSecondBuild',
        'after_second_build': 'actionAfterSecondBuild'
    };
    
    const elementId = actionMap[actionType];
    console.log(`📍 Mapped to element ID: ${elementId}`);
    
    if (elementId) {
        const element = document.getElementById(elementId);
        console.log(`🎯 Found element:`, element);
        
        if (element) {
            const checkbox = element.querySelector('.action-checkbox');
            console.log(`✅ Found checkbox:`, checkbox);
            
            if (checkbox) {
                checkbox.textContent = '☑';
                checkbox.classList.add('checked');
                console.log(`✨ Checkbox updated for ${actionType}!`);
            }
        }
    }
});
