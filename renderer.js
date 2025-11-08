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
        console.log('DEBUG: Start Live View button clicked. Requesting live view start...');
        updateStatus('Starting live view...', 'info');
        const started = await ipcRenderer.invoke('start-live-view');
        if (started) {
            isCapturing = true;
            startLiveViewBtn.style.display = 'none';
            stopLiveViewBtn.style.display = 'block';
            updateStatus('Live view started', 'success');
        } else {
            updateStatus('Live view already running', 'warn');
            console.log('DEBUG: Live view start request returned false (already running).');
        }
    } catch (error) {
        updateStatus(`Failed to start live view: ${error.message}`, 'error');
    }
});

stopLiveViewBtn.addEventListener('click', async () => {
    try {
        console.log('DEBUG: Stop Live View button clicked.');
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
        
        // Hide stage information since we don't know what stage we're in yet
        const stageDetails = document.getElementById('stageDetails');
        const prevStageDetails = document.getElementById('prevStageDetails');
        
        if (stageDetails) {
            stageDetails.style.display = 'none';
        }
        if (prevStageDetails) {
            prevStageDetails.style.display = 'none';
        }
        
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
    const { x: currentRegionX, y: currentRegionY, width: currentRegionWidth, height: currentRegionHeight } = currentRegion;

    // Calculate the scaling factor using the displayed canvas size (not internal canvas.width)
    // rect.width gives us the actual displayed size in CSS pixels
    const scaleFactor = rect.width / currentRegionWidth;

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
        currentFunctionDisplay.textContent = functionName ? functionName : 'Idle';
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
ipcRenderer.on('update-current-level-name', (event, levelName, levelAverageMs, levelAvgUpMs, levelAvgDownMs, levelBestUpMs, levelBestDownMs, levelLastUpMs, levelLastDownMs) => {
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
        
        if (levelAverageMs || levelAvgUpMs || levelAvgDownMs || levelBestUpMs || levelBestDownMs) {
            // Format average times for both directions
            const avgUpText = levelAvgUpMs ? formatDuration(levelAvgUpMs) + `<sup style="font-size: 0.65em; opacity: 0.5; margin-left: 2px;">u</sup>` : '—';
            const avgDownText = levelAvgDownMs ? formatDuration(levelAvgDownMs) + `<sup style="font-size: 0.65em; opacity: 0.5; margin-left: 2px;">d</sup>` : '—';
            
            // Format best times for both directions
            const bestUpText = levelBestUpMs ? formatDuration(levelBestUpMs) + `<sup style="font-size: 0.65em; opacity: 0.5; margin-left: 2px;">u</sup>` : '—';
            const bestDownText = levelBestDownMs ? formatDuration(levelBestDownMs) + `<sup style="font-size: 0.65em; opacity: 0.5; margin-left: 2px;">d</sup>` : '—';
            
            // Format last times for both directions
            const lastUpText = levelLastUpMs ? formatDuration(levelLastUpMs) + `<sup style="font-size: 0.65em; opacity: 0.5; margin-left: 2px;">u</sup>` : '—';
            const lastDownText = levelLastDownMs ? formatDuration(levelLastDownMs) + `<sup style="font-size: 0.65em; opacity: 0.5; margin-left: 2px;">d</sup>` : '—';
            
            currentLevelNameDisplay.innerHTML = `
                <div style="font-size: 1.6em; font-weight: 700; margin-bottom: 6px; color: #e0e6ed;">${name}</div>
                <div style="font-size: 0.95em; margin-bottom: 3px; display: flex; gap: 12px; flex-wrap: wrap;">
                    <div>
                        <span style="color: #ffc107; font-weight: 600;">avg:</span> 
                        <span style="color: #e0e6ed; font-weight: 500;">${avgUpText} / ${avgDownText}</span>
                    </div>
                    <div>
                    <span style="color: #4caf50; font-weight: 600;">best:</span> 
                        <span style="color: #e0e6ed; font-weight: 500;">${bestUpText} / ${bestDownText}</span>
                    </div>
                </div>
                <div style="font-size: 1em;">
                    <span style="color: #9c27b0; font-weight: 600;">last:</span> 
                    <span style="color: #e0e6ed; font-weight: 500; margin-right: 10px;">${lastUpText} / ${lastDownText}</span>
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
// IPC listener for daily stats updates
ipcRenderer.on('update-daily-stats', async (event, dailyStats) => {
    try {
        // Get 7-day data for averages
        const recentDays = await ipcRenderer.invoke('get-daily-stats-recent', 7);
        
        // Calculate 7-day averages
        let totalLevels = 0;
        let totalStages = 0;
        let daysWithData = 0;
        
        if (recentDays && recentDays.length > 0) {
            recentDays.forEach(day => {
                if (day.levelsCompleted > 0 || day.stagesCompleted > 0) {
                    totalLevels += day.levelsCompleted;
                    totalStages += day.stagesCompleted;
                    daysWithData++;
                }
            });
        }
        
        const avgLevelsPerDay = daysWithData > 0 ? (totalLevels / daysWithData).toFixed(1) : '—';
        const avgStagesPerDay = daysWithData > 0 ? (totalStages / daysWithData).toFixed(1) : '—';
        
        // Update display
        const dailyTodayLevels = document.getElementById('dailyTodayLevels');
        const dailyTodayStages = document.getElementById('dailyTodayStages');
        const dailyAvgLevels = document.getElementById('dailyAvgLevels');
        const dailyAvgStages = document.getElementById('dailyAvgStages');
        
        if (dailyTodayLevels) {
            dailyTodayLevels.textContent = dailyStats.levelsCompleted || 0;
        }
        if (dailyTodayStages) {
            dailyTodayStages.textContent = dailyStats.stagesCompleted || 0;
        }
        if (dailyAvgLevels) {
            dailyAvgLevels.textContent = avgLevelsPerDay;
        }
        if (dailyAvgStages) {
            dailyAvgStages.textContent = avgStagesPerDay;
        }
    } catch (error) {
        console.error('Error updating daily stats display:', error);
    }
});

ipcRenderer.on('update-stage-info', async (event, stageInfo) => {
    console.log(`RENDERER: Received stage info - previous stage: ${stageInfo.previous ? stageInfo.previous.name : 'null'}`);
    // Load statistics data for comparison calculations
    await loadStatisticsData();
    
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
        // Always show records section now (includes daily stats)
        const systemStatus = document.querySelector('.system-status');
        if (systemStatus) {
            systemStatus.style.display = 'block';
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

    // Always keep records section visible (includes daily stats)
    const systemStatus = document.querySelector('.system-status');
    if (systemStatus) {
        systemStatus.style.display = 'block';
    }
});

function formatDuration(durationMs) {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

// Calculate ETA for completing the current stage (using historical averages for each level)
// Calculate ETA for remaining levels only (averaging up/down directions)
async function calculateStageETA(currentStage, stageLevelNames) {
    if (!currentStage || !stageLevelNames) return null;
    
    // Map currentStage.level (counts non-N/A levels) to array position
    let nonNALevelsSeen = 0;
    let currentLevelArrayPosition = -1;
    for (let p = 0; p < stageLevelNames.length; p++) {
        if (stageLevelNames[p] !== 'N/A') {
            nonNALevelsSeen++;
            if (nonNALevelsSeen === currentStage.level) {
                currentLevelArrayPosition = p;
                break;
            }
        }
    }
    
    if (currentLevelArrayPosition >= stageLevelNames.length || currentLevelArrayPosition < 0) return 0; // Stage complete or invalid
    
    let totalETA = 0;
    
    // Add ETA for current level (average of up/down - elapsed time)
    const currentLevelName = stageLevelNames[currentLevelArrayPosition];
    if (currentLevelName && currentLevelName !== 'N/A') {
        const avgByDir = await ipcRenderer.invoke('get-level-average-by-direction', currentLevelName);
        const avgUpDown = getAverageOfDirections(avgByDir);
        
        if (avgUpDown !== null) {
            const currentLevelElapsed = currentLevelStartTime ? Date.now() - currentLevelStartTime : 0;
            const currentLevelETA = Math.max(0, avgUpDown - currentLevelElapsed);
            totalETA += currentLevelETA;
        } else {
            return null; // No data for current level
        }
    }
    
    // Add average of up/down for remaining levels (skip N/A levels)
    for (let pos = currentLevelArrayPosition + 1; pos < stageLevelNames.length; pos++) {
        const levelName = stageLevelNames[pos];
        if (levelName && levelName !== 'N/A') {
            const avgByDir = await ipcRenderer.invoke('get-level-average-by-direction', levelName);
            const avgUpDown = getAverageOfDirections(avgByDir);
            
            if (avgUpDown !== null) {
                totalETA += avgUpDown;
            } else {
                // If any level has no data, can't calculate accurate ETA
                return null;
            }
        }
    }
    
    return Math.round(totalETA);
}

// Calculate estimated time to finish entire stage (completed + remaining)
async function calculateStageEstimate(currentStage, stageLevelNames) {
    if (!currentStage || !stageLevelNames) return null;
    
    // Map currentStage.level (counts non-N/A levels) to array position
    let nonNALevelsSeen = 0;
    let currentLevelArrayPosition = -1;
    for (let p = 0; p < stageLevelNames.length; p++) {
        if (stageLevelNames[p] !== 'N/A') {
            nonNALevelsSeen++;
            if (nonNALevelsSeen === currentStage.level) {
                currentLevelArrayPosition = p;
                break;
            }
        }
    }
    
    if (currentLevelArrayPosition < 0) return null;
    if (currentLevelArrayPosition >= stageLevelNames.length) return 0; // Stage complete
    
    let totalEstimate = 0;
    
    // Add actual times for completed levels (from currentStage.levels array)
    if (currentStage.levels && currentStage.levels.length > 0) {
        for (const level of currentStage.levels) {
            totalEstimate += level.durationMs || 0;
        }
    }
    
    // Add average of up/down for current level (if not yet completed)
    const currentLevelName = stageLevelNames[currentLevelArrayPosition];
    const isCurrentLevelCompleted = currentStage.levels && currentStage.levels.some(l => l.name === currentLevelName);
    
    if (!isCurrentLevelCompleted && currentLevelName && currentLevelName !== 'N/A') {
        const avgByDir = await ipcRenderer.invoke('get-level-average-by-direction', currentLevelName);
        const avgUpDown = getAverageOfDirections(avgByDir);
        if (avgUpDown !== null) {
            totalEstimate += avgUpDown;
        } else {
            return null; // No data
        }
    }
    
    // Add average of up/down for remaining levels
    for (let pos = currentLevelArrayPosition + 1; pos < stageLevelNames.length; pos++) {
        const levelName = stageLevelNames[pos];
        if (levelName && levelName !== 'N/A') {
            const avgByDir = await ipcRenderer.invoke('get-level-average-by-direction', levelName);
            const avgUpDown = getAverageOfDirections(avgByDir);
            
            if (avgUpDown !== null) {
                totalEstimate += avgUpDown;
            } else {
                return null;
            }
        }
    }
    
    return Math.round(totalEstimate);
}

// Helper: Get average of up/down directions (returns null if both are null)
function getAverageOfDirections(avgByDir) {
    if (!avgByDir) return null;
    
    const up = avgByDir.up;
    const down = avgByDir.down;
    
    if (up !== null && down !== null) {
        return Math.round((up + down) / 2);
    } else if (up !== null) {
        return up;
    } else if (down !== null) {
        return down;
    }
    
    return null;
}

// Calculate ETA for a specific level position (using historical average for that level)
async function calculateLevelETA(currentStage, levelPosition, levelName, stageLevelNames) {
    if (!currentStage || !levelName || levelName === 'N/A') return null;
    
    // Map currentStage.level (counts non-N/A levels) to array position
    let nonNALevelsSeen = 0;
    let currentLevelArrayPosition = -1;
    
    // If we don't have stageLevelNames, we can't accurately map, so fall back to counting from currentStage
    if (!stageLevelNames) {
        // Best effort: assume no N/A before current position
        currentLevelArrayPosition = currentStage.level - 1;
    } else {
        for (let p = 0; p < stageLevelNames.length; p++) {
            if (stageLevelNames[p] !== 'N/A') {
                nonNALevelsSeen++;
                if (nonNALevelsSeen === currentStage.level) {
                    currentLevelArrayPosition = p;
                    break;
                }
            }
        }
    }
    
    if (levelPosition === currentLevelArrayPosition) {
        // For current level: ETA = historical avg - elapsed time
        const levelAvg = await ipcRenderer.invoke('get-level-average', levelName);
        if (!levelAvg) return null;
        
        const currentLevelElapsed = currentLevelStartTime ? Date.now() - currentLevelStartTime : 0;
        return Math.max(0, Math.round(levelAvg - currentLevelElapsed));
    } else if (levelPosition > currentLevelArrayPosition) {
        // For upcoming levels: just return the historical average for that level
        const levelAvg = await ipcRenderer.invoke('get-level-average', levelName);
        return levelAvg ? Math.round(levelAvg) : null;
    }
    
    return null; // Should not happen for completed levels
}

// Update all stage ETAs in real-time (only updates current level ETA as it counts down)
async function updateStageETAs() {
    if (!currentStageInfo || !currentStageInfo.current) return;
    
    const stageLevels = document.getElementById('stageLevels');
    if (!stageLevels) return;
    
    const isPartialStage = currentStageInfo.current.isPartial || false;
    
    // Handle partial stages differently
    if (isPartialStage) {
        // For partial stages, find and update the current level item (last item in the list)
        const levelItems = stageLevels.querySelectorAll('.stage-level-item');
        if (levelItems.length > 0) {
            const lastItem = levelItems[levelItems.length - 1];
            // Only update if it's the current level (not a completed level)
            if (lastItem.classList.contains('stage-level-current')) {
                const timeSpan = lastItem.querySelector('.stage-level-time');
                const currentLevelName = currentStageInfo.current.currentLevelName;
                
                if (timeSpan && currentLevelName && currentLevelName !== 'Unknown Level' && currentLevelName !== 'Unnamed Level') {
                    // Calculate ETA for current level using historical average
                    const levelStats = statisticsData.levels[currentLevelName];
                    let eta = null;
                    if (levelStats) {
                        const allCompletions = [
                            ...(levelStats.completionsUp || []),
                            ...(levelStats.completionsDown || [])
                        ];
                        if (allCompletions.length > 0) {
                            const avg = allCompletions.reduce((sum, time) => sum + time, 0) / allCompletions.length;
                            const elapsed = Date.now() - currentStageInfo.current.startTime - currentStageInfo.current.levels.reduce((sum, l) => sum + l.durationMs, 0);
                            eta = Math.max(0, avg - elapsed);
                        }
                    }
                    if (eta !== null) {
                        timeSpan.textContent = `eta: ${formatDuration(eta)}`;
                    }
                }
            }
        }
        return;
    }
    
    // Normal stage handling
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
        const est = await calculateStageEstimate(currentStageInfo.current, stageLevelNames);
        const estText = est !== null ? ` • est: ${formatDuration(est)}` : '';
        const eta = await calculateStageETA(currentStageInfo.current, stageLevelNames);
        const etaText = eta !== null ? ` • eta: ${formatDuration(eta)}` : '';
        currentSummary.innerHTML = `<div style="font-size: 1.2em; font-weight: 700; margin-bottom: 4px;">Current Stage: ${currentStageInfo.current.name}</div><div style="font-size: 0.85em; color: #a8b2c4;">avg: ${a} • best: ${b}${estText}${etaText}</div>`;
    }
    
    // Update ONLY current level ETA (upcoming levels stay at their historical average)
    const levelItems = stageLevels.querySelectorAll('.stage-level-item');
    
    // Map currentStage.level (counts non-N/A levels) to array position in stageLevelNames
    let nonNALevelsSeen = 0;
    let currentLevelArrayPosition = -1;
    for (let p = 0; p < stageLevelNames.length; p++) {
        if (stageLevelNames[p] !== 'N/A') {
            nonNALevelsSeen++;
            if (nonNALevelsSeen === currentStageInfo.current.level) {
                currentLevelArrayPosition = p;
                break;
            }
        }
    }
    
    // levelItems only has non-N/A entries, so we need to use currentStage.level - 1 as the index
    const currentLevelItemIndex = currentStageInfo.current.level - 1;
    
    // Only update the current level's ETA
    if (currentLevelItemIndex >= 0 && currentLevelItemIndex < levelItems.length && currentLevelArrayPosition >= 0) {
        const currentLevelItem = levelItems[currentLevelItemIndex];
        const timeSpan = currentLevelItem.querySelector('.stage-level-time');
        const levelName = stageLevelNames[currentLevelArrayPosition];
        
        if (timeSpan && !currentLevelItem.classList.contains('stage-level-completed') && levelName) {
            const eta = await calculateLevelETA(currentStageInfo.current, currentLevelArrayPosition, levelName, stageLevelNames);
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
    // Note: Using updatePreviousStageDetailsCompact for consistent formatting

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
            
            const est = await calculateStageEstimate(stageInfo.current, stageLevelNames);
            const estText = est !== null ? ` • est: ${formatDuration(est)}` : '';
            const eta = await calculateStageETA(stageInfo.current, stageLevelNames);
            const etaText = eta !== null ? ` • eta: ${formatDuration(eta)}` : '';
            currentSummary.innerHTML = `<div style="font-size: 1.2em; font-weight: 700; margin-bottom: 4px;">Current Stage: ${stageInfo.current.name}</div><div style="font-size: 0.85em; color: #a8b2c4;">avg: ${a} • best: ${b}${estText}${etaText}</div>`;
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
    
    // Validate previous stage data
    if (!previousStage) {
        console.log(`RENDERER: No previous stage data provided`);
        if (prevStageDetails) prevStageDetails.style.display = 'none';
        return;
    }
    
    if (!previousStage.levels || !Array.isArray(previousStage.levels)) {
        console.log(`RENDERER: Previous stage has invalid levels data:`, previousStage.levels);
        if (prevStageDetails) prevStageDetails.style.display = 'none';
        return;
    }
    
    if (previousStage.levels.length === 0) {
        console.log(`RENDERER: Previous stage has no levels`);
        if (prevStageDetails) prevStageDetails.style.display = 'none';
        return;
    }
    
    console.log(`RENDERER: Updating previous stage "${previousStage.name}" with ${previousStage.levels.length} levels: [${previousStage.levels.map(l => l.name).join(', ')}]`);
    
    if (prevStageDetails) prevStageDetails.style.display = 'block';
    
    if (prevStageLevels) {
        prevStageLevels.innerHTML = '';
        
        const isPartialStage = previousStage.isPartial || false;
        
        // For partial stages, use actual level names from completed levels
        // For full stages, get level names from database
        if (isPartialStage) {
            console.log(`DEBUG: Rendering partial stage as previous stage - showing actual level names`);
            
            // Show only the levels that were actually completed in the partial stage
            previousStage.levels.forEach((level, index) => {
                const levelDiv = document.createElement('div');
                
                // Use saved comparison data, recalculate with correct direction if not saved
                const comparisons = level.comparisons || calculateLevelComparisons(level.durationMs, level.name, level.direction || 'up');
                
                // Determine blended color based on both comparisons
                let blendedColor = '';
                const avgColor = comparisons.average.cssClass;
                const bestColor = comparisons.best.cssClass;
                
                // Create blended color combinations
                if (avgColor === 'stage-level-green' && bestColor === 'stage-level-green') {
                    blendedColor = 'stage-level-green-green';
                } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-blue') {
                    blendedColor = 'stage-level-green-blue';
                } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-gold') {
                    blendedColor = 'stage-level-green-gold';
                } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-green') {
                    blendedColor = 'stage-level-blue-green';
                } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-blue') {
                    blendedColor = 'stage-level-blue-blue';
                } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-gold') {
                    blendedColor = 'stage-level-blue-gold';
                } else if (avgColor === 'stage-level-gold' && bestColor === 'stage-level-gold') {
                    blendedColor = 'stage-level-gold-gold';
                } else if (avgColor === 'stage-level-gold' && bestColor === 'stage-level-green') {
                    blendedColor = 'stage-level-gold-green';
                } else if (avgColor === 'stage-level-gold' && bestColor === 'stage-level-blue') {
                    blendedColor = 'stage-level-gold-blue';
                } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-red') {
                    blendedColor = 'stage-level-green-red';
                } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-green') {
                    blendedColor = 'stage-level-red-green';
                } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-red') {
                    blendedColor = 'stage-level-blue-red';
                } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-blue') {
                    blendedColor = 'stage-level-red-blue';
                } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-red') {
                    blendedColor = 'stage-level-red-red';
                } else {
                    // Fallback for any other combinations
                    blendedColor = 'stage-level-red-red';
                }
                
                levelDiv.className = 'stage-level-item stage-level-completed';
                
                const timeDisplay = formatDuration(level.durationMs);
                
                levelDiv.innerHTML = `
                    <div class="stage-level-main ${blendedColor}">
                        <span class="stage-level-name">${level.name} <sup>${level.direction === 'up' ? 'u' : 'd'}</sup>&nbsp;</span>
                        <span class="stage-level-time">    ${timeDisplay}</span>
                    </div>
                    <div class="stage-level-delta-box ${comparisons.average.cssClass}">
                        avg: ${comparisons.average.arrow} ${comparisons.average.timeDelta}
                    </div>
                    <div class="stage-level-delta-box ${comparisons.best.cssClass}">
                        best: ${comparisons.best.arrow} ${comparisons.best.timeDelta}
                    </div>
                `;
                prevStageLevels.appendChild(levelDiv);
                console.log(`DEBUG: Added completed level from partial stage: ${level.name} (${formatDuration(level.durationMs)})`);
            });
        } else {
            // Full stage - use database to show all 7 positions
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
        let completedLevelIndex = 0; // Track index into previousStage.levels array
        for (let position = 0; position < 7; position++) {
            const levelIndex = position;
            const levelName = stageLevelNames[levelIndex] || `Level ${levelIndex + 1}`;
            
            // Skip N/A levels - they don't exist in the game
            if (levelName === 'N/A') {
                console.log(`DEBUG: Skipping N/A level at position ${position} in previous stage`);
                continue;
            }
            
            const levelDiv = document.createElement('div');
            
            if (completedLevelIndex < previousStage.levels.length) {
                // Show completed level - use levelName from database (has originalName for position 1)
                const level = previousStage.levels[completedLevelIndex];
                
                    // Recalculate comparison to get color class and timeDelta format, using the correct direction
                    const comparisons = level.comparisons || calculateLevelComparisons(level.durationMs, levelName, level.direction || 'up');
                    
                    // Determine blended color based on both comparisons (same logic as current stage)
                    let blendedColor = '';
                    const avgColor = comparisons.average.cssClass;
                    const bestColor = comparisons.best.cssClass;
                    
                    // Create blended color combinations (same as current stage)
                    // Gold combinations (new best time)
                    if (bestColor === 'stage-level-gold') {
                        if (avgColor === 'stage-level-green') {
                            blendedColor = 'stage-level-green-gold';
                        } else if (avgColor === 'stage-level-blue') {
                            blendedColor = 'stage-level-blue-gold';
                        } else if (avgColor === 'stage-level-red') {
                            blendedColor = 'stage-level-red-gold';
                        } else {
                            blendedColor = 'stage-level-gold-gold';
                        }
                    } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-green') {
                        blendedColor = 'stage-level-green-green';
                    } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-blue') {
                        blendedColor = 'stage-level-green-blue';
                    } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-green') {
                        blendedColor = 'stage-level-blue-green';
                    } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-blue') {
                        blendedColor = 'stage-level-blue-blue';
                    } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-red') {
                        blendedColor = 'stage-level-green-red';
                    } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-green') {
                        blendedColor = 'stage-level-red-green';
                    } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-red') {
                        blendedColor = 'stage-level-blue-red';
                    } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-blue') {
                        blendedColor = 'stage-level-red-blue';
                    } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-red') {
                        blendedColor = 'stage-level-red-red';
                    } else {
                        // Fallback for any other combinations
                        blendedColor = 'stage-level-red-red';
                    }
                
                // Apply color class based on performance
                    levelDiv.className = 'stage-level-item stage-level-completed';
                    
                    // Build time display
                    const timeDisplay = formatDuration(level.durationMs);
                
                levelDiv.innerHTML = `
                        <div class="stage-level-main ${blendedColor}">
                            <span class="stage-level-name">${levelName} <sup>${level.direction === 'up' ? 'u' : 'd'}</sup>&nbsp;</span>
                            <span class="stage-level-time">    ${timeDisplay}</span>
                        </div>
                        <div class="stage-level-delta-box ${comparisons.average.cssClass}">
                            avg: ${comparisons.average.arrow} ${comparisons.average.timeDelta}
                        </div>
                        <div class="stage-level-delta-box ${comparisons.best.cssClass}">
                            best: ${comparisons.best.arrow} ${comparisons.best.timeDelta}
                        </div>
                `;
                completedLevelIndex++; // Increment only for displayed levels
            } else {
                // Show level name without time (if available)
                levelDiv.className = 'stage-level-item stage-level-incomplete';
                levelDiv.innerHTML = `
                        <span class="stage-level-name">${levelName} <sup>${level.direction === 'up' ? 'u' : 'd'}</sup>&nbsp;</span>
                    <span class="stage-level-time">—</span>
                `;
            }
            
            prevStageLevels.appendChild(levelDiv);
            }
        }
    }
}

/**
 * Calculate comparison indicator for a level time vs its historical average for a specific direction
 * Returns object with arrow and percentage text
 */
function calculateLevelComparison(actualTime, levelName, direction = 'up') {
    // Get historical average for this level
    const levelStats = statisticsData.levels[levelName];
    
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

/**
 * Calculate both average and best comparisons for a level time
 * Returns object with separate average and best comparisons
 */
function calculateLevelComparisons(actualTime, levelName, direction = 'up') {
    const levelStats = statisticsData.levels[levelName];
    
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
    
    // Find best time
    const best = Math.min(...directionCompletions);
    
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

async function updateCurrentStageDetails(currentStage) {
    updateStageCallCounter++;
    await ipcRenderer.invoke('renderer-log', `updateCurrentStageDetails called #${updateStageCallCounter}`);
    
    const stageDetails = document.getElementById('stageDetails');
    const stageLevels = document.getElementById('stageLevels');
    
    if (!currentStage) {
        if (stageDetails) stageDetails.style.display = 'none';
        return;
    }
    
    // Log what we received
    await ipcRenderer.invoke('renderer-log', `Received stage "${currentStage.name}" level:${currentStage.level} with ${currentStage.levels.length} levels: [${currentStage.levels.map(l => l.name).join(', ')}]`);
    await ipcRenderer.invoke('renderer-log', `Stage isPartial: ${currentStage.isPartial}, currentLevelName: ${currentStage.currentLevelName}`);
    
    if (stageDetails) stageDetails.style.display = 'block';
    
    if (stageLevels) {
        console.log(`DEBUG: Clearing stage levels container (was: ${stageLevels.children.length} children)`);
        stageLevels.innerHTML = '';
        let levelItemsAdded = 0;
        
        // Get the level database to show actual level names
        let stageLevelNames = [];
        let isPartialStage = currentStage.isPartial || false;
        
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
        
        // For partial stages, we display levels differently
        console.log(`DEBUG: Checking isPartialStage: ${isPartialStage}`);
        if (isPartialStage) {
            console.log(`DEBUG: Rendering partial stage - showing only completed and current level`);
            
            // Show completed levels
            console.log(`DEBUG: Rendering ${currentStage.levels.length} completed levels in partial stage`);
            currentStage.levels.forEach((level, index) => {
                const levelDiv = document.createElement('div');
                
                // Use saved comparison data if available, otherwise recalculate with correct direction
                // This ensures colors persist and match the full stage methodology
                const comparisons = level.comparisons || calculateLevelComparisons(level.durationMs, level.name, level.direction || 'up');
                
                // Determine blended color based on both comparisons
                let blendedColor = '';
                const avgColor = comparisons.average.cssClass;
                const bestColor = comparisons.best.cssClass;
                
                // Create blended color combinations
                if (avgColor === 'stage-level-green' && bestColor === 'stage-level-green') {
                    blendedColor = 'stage-level-green-green';
                } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-blue') {
                    blendedColor = 'stage-level-green-blue';
                } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-gold') {
                    blendedColor = 'stage-level-green-gold';
                } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-green') {
                    blendedColor = 'stage-level-blue-green';
                } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-blue') {
                    blendedColor = 'stage-level-blue-blue';
                } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-gold') {
                    blendedColor = 'stage-level-blue-gold';
                } else if (avgColor === 'stage-level-gold' && bestColor === 'stage-level-gold') {
                    blendedColor = 'stage-level-gold-gold';
                } else if (avgColor === 'stage-level-gold' && bestColor === 'stage-level-green') {
                    blendedColor = 'stage-level-gold-green';
                } else if (avgColor === 'stage-level-gold' && bestColor === 'stage-level-blue') {
                    blendedColor = 'stage-level-gold-blue';
                } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-red') {
                    blendedColor = 'stage-level-green-red';
                } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-green') {
                    blendedColor = 'stage-level-red-green';
                } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-red') {
                    blendedColor = 'stage-level-blue-red';
                } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-blue') {
                    blendedColor = 'stage-level-red-blue';
                } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-red') {
                    blendedColor = 'stage-level-red-red';
                } else {
                    // Fallback for any other combinations
                    blendedColor = 'stage-level-red-red';
                }
                
                levelDiv.className = 'stage-level-item stage-level-completed';
                
                const timeDisplay = formatDuration(level.durationMs);
                
                const htmlContent = `
                    <div class="stage-level-main ${blendedColor}">
                        <span class="stage-level-name">${level.name} <sup>${level.direction === 'up' ? 'u' : 'd'}</sup>&nbsp;</span>
                        <span class="stage-level-time">    ${timeDisplay}</span>
                    </div>
                    <div class="stage-level-delta-box ${comparisons.average.cssClass}">
                        avg: ${comparisons.average.arrow} ${comparisons.average.timeDelta}
                    </div>
                    <div class="stage-level-delta-box ${comparisons.best.cssClass}">
                        best: ${comparisons.best.arrow} ${comparisons.best.timeDelta}
                    </div>
                `;
                console.log(`DEBUG PARTIAL STAGE HTML for "${level.name}":`, htmlContent);
                levelDiv.innerHTML = htmlContent;
                stageLevels.appendChild(levelDiv);
                console.log(`DEBUG: Added completed level in partial stage: ${level.name} (${formatDuration(level.durationMs)})`);
            });
            
            // Show current level (if we have a name for it)
            if (currentStage.currentLevelName && currentStage.currentLevelName !== 'Unknown Level' && currentStage.currentLevelName !== 'Unnamed Level') {
                const levelDiv = document.createElement('div');
                levelDiv.className = 'stage-level-item stage-level-current';
                
                // Calculate ETA for current level using historical average
                const levelStats = statisticsData.levels[currentStage.currentLevelName];
                let eta = null;
                if (levelStats) {
                    const allCompletions = [
                        ...(levelStats.completionsUp || []),
                        ...(levelStats.completionsDown || [])
                    ];
                    if (allCompletions.length > 0) {
                        const avg = allCompletions.reduce((sum, time) => sum + time, 0) / allCompletions.length;
                        const elapsed = Date.now() - currentStage.startTime - currentStage.levels.reduce((sum, l) => sum + l.durationMs, 0);
                        eta = Math.max(0, avg - elapsed);
                    }
                }
                const etaText = eta !== null ? `eta: ${formatDuration(eta)}` : 'Calculating...';
                
                levelDiv.innerHTML = `
                    <div class="stage-level-main">
                        <span class="stage-level-name">${currentStage.currentLevelName}</span>
                        <span class="stage-level-time">    ${etaText}</span>
                    </div>
                `;
                stageLevels.appendChild(levelDiv);
                console.log(`DEBUG: Added current level in partial stage: ${currentStage.currentLevelName} (${etaText})`);
            }
        } else {
            // Normal stage rendering with all 7 positions
        // Map currentStage.level (counts non-N/A levels) to array position (includes N/A)
        let nonNALevelsSeen = 0;
        let currentLevelArrayPosition = -1;
        for (let p = 0; p < stageLevelNames.length; p++) {
            if (stageLevelNames[p] !== 'N/A') {
                nonNALevelsSeen++;
                if (nonNALevelsSeen === currentStage.level) {
                    currentLevelArrayPosition = p;
                    break;
                }
            }
        }
        
            await ipcRenderer.invoke('renderer-log', `Normal stage render: level=${currentStage.level}, arrayPos=${currentLevelArrayPosition}, completed=${currentStage.levels.length}`);
            await ipcRenderer.invoke('renderer-log', `Stage database names: [${stageLevelNames.join(', ')}]`);
        
        let completedLevelIndex = 0; // Index into currentStage.levels array
        
        for (let position = 0; position < 7; position++) {
            try {
                const levelIndex = position;
                const levelName = stageLevelNames[levelIndex] || `Level ${levelIndex + 1}`;
                
                // Skip N/A levels - they don't exist in the game
                if (levelName === 'N/A') {
                    continue;
                }
                
                const levelDiv = document.createElement('div');
                
                // Check if this position corresponds to a completed level
                if (position < currentLevelArrayPosition) {
                // Show completed level - use levelName from database (has originalName for position 1)
                const level = currentStage.levels[completedLevelIndex];
                        
                        // Safety check: if level data is missing, skip this position
                        if (!level) {
                            await ipcRenderer.invoke('renderer-log', `ERROR: Missing level at position ${position}, completedLevelIndex=${completedLevelIndex}, expected="${levelName}"`);
                            await ipcRenderer.invoke('renderer-log', `ERROR: currentStage.levels has ${currentStage.levels.length} entries, currentLevelArrayPosition=${currentLevelArrayPosition}`);
                            // Don't increment completedLevelIndex, and skip adding this div
                            continue;
                        }
                        
                        await ipcRenderer.invoke('renderer-log', `Rendering completed level #${completedLevelIndex}: position=${position}, dbName="${levelName}", actualName="${level.name}"`);

                        
                        // Use saved comparison data if available, otherwise recalculate with correct direction
                        // This ensures colors persist from current to previous stage
                        const comparisons = level.comparisons || calculateLevelComparisons(level.durationMs, levelName, level.direction || 'up');
                        
                        // Determine blended color based on both comparisons
                        let blendedColor = '';
                        const avgColor = comparisons.average.cssClass;
                        const bestColor = comparisons.best.cssClass;
                        
                        // Create blended color combinations
                        // Gold combinations (new best time)
                        if (bestColor === 'stage-level-gold') {
                            if (avgColor === 'stage-level-green') {
                                blendedColor = 'stage-level-green-gold';
                            } else if (avgColor === 'stage-level-blue') {
                                blendedColor = 'stage-level-blue-gold';
                            } else if (avgColor === 'stage-level-red') {
                                blendedColor = 'stage-level-red-gold';
                            } else {
                                blendedColor = 'stage-level-gold-gold';
                            }
                        } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-green') {
                            blendedColor = 'stage-level-green-green';
                        } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-blue') {
                            blendedColor = 'stage-level-green-blue';
                        } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-green') {
                            blendedColor = 'stage-level-blue-green';
                        } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-blue') {
                            blendedColor = 'stage-level-blue-blue';
                        } else if (avgColor === 'stage-level-green' && bestColor === 'stage-level-red') {
                            blendedColor = 'stage-level-green-red';
                        } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-green') {
                            blendedColor = 'stage-level-red-green';
                        } else if (avgColor === 'stage-level-blue' && bestColor === 'stage-level-red') {
                            blendedColor = 'stage-level-blue-red';
                        } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-blue') {
                            blendedColor = 'stage-level-red-blue';
                        } else if (avgColor === 'stage-level-red' && bestColor === 'stage-level-red') {
                            blendedColor = 'stage-level-red-red';
                        } else {
                            // Fallback for any other combinations
                            blendedColor = 'stage-level-red-red';
                        }
                        
                        // Apply color class based on performance
                        levelDiv.className = 'stage-level-item stage-level-completed';
                        
                        // Build time display
                        const timeDisplay = formatDuration(level.durationMs);
                
                        levelDiv.innerHTML = `
                            <div class="stage-level-main ${blendedColor}">
                                <span class="stage-level-name">${levelName} <sup>${level.direction === 'up' ? 'u' : 'd'}</sup>&nbsp;</span>
                                <span class="stage-level-time">    ${timeDisplay}</span>
                            </div>
                            <div class="stage-level-delta-box ${comparisons.average.cssClass}">
                                avg: ${comparisons.average.arrow} ${comparisons.average.timeDelta}
                            </div>
                            <div class="stage-level-delta-box ${comparisons.best.cssClass}">
                                best: ${comparisons.best.arrow} ${comparisons.best.timeDelta}
                            </div>
                        `;
                levelItemsAdded++;
                completedLevelIndex++;
            } else if (position === currentLevelArrayPosition) {
                // Show current level with actual name and ETA
                levelDiv.className = 'stage-level-item stage-level-current';
                
                // Calculate ETA for current level (historical avg - elapsed time)
                const eta = await calculateLevelETA(currentStage, position, levelName, stageLevelNames);
                const etaText = eta !== null ? `eta: ${formatDuration(eta)}` : 'Calculating...';
                
                levelDiv.innerHTML = `
                    <div class="stage-level-main">
                        <span class="stage-level-name">${levelName}</span>
                        <span class="stage-level-time">    ${etaText}</span>
                    </div>
                `;
                levelItemsAdded++;
                    await ipcRenderer.invoke('renderer-log', `Rendering current level at position ${position}: "${levelName}"`);
            } else {
                // Show upcoming level with historical average as static ETA
                levelDiv.className = 'stage-level-item';
                
                // Get historical average for this specific level (static, doesn't count down)
                const eta = await calculateLevelETA(currentStage, position, levelName, stageLevelNames);
                const etaText = eta !== null ? `eta: ${formatDuration(eta)}` : '—';
                
                levelDiv.innerHTML = `
                    <div class="stage-level-main">
                        <span class="stage-level-name">${levelName}</span>
                        <span class="stage-level-time">    ${etaText}</span>
                    </div>
                `;
                levelItemsAdded++;
            }
            
            stageLevels.appendChild(levelDiv);
            } catch (error) {
                console.error(`ERROR: Failed to process level at position ${position}:`, error);
                }
            }
        }
        
        console.log(`DEBUG: Total level items added: ${levelItemsAdded}, Final DOM children count: ${stageLevels.children.length}`);
    }
}

// Removed updatePreviousStageDetails function - using updatePreviousStageDetailsCompact for consistent formatting

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
    await populateLevelsView();
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
    levelSort.onchange = async () => await populateLevelsView();
    ignoreExtremes.onchange = () => populateStagesView();
    
    // Show mismatched directions checkbox
    const showMismatchedDirections = document.getElementById('showMismatchedDirections');
    if (showMismatchedDirections) {
        showMismatchedDirections.onchange = async () => await populateLevelsView();
    }
    
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
            header.onclick = async () => {
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
                await populateLevelsView();
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

async function populateLevelsView() {
    const tbody = document.getElementById('levelsTableBody');
    const sortBy = document.getElementById('levelSort').value;
    const showMismatched = document.getElementById('showMismatchedDirections').checked;
    
    // Get all levels from statistics
    const allLevels = [];
    
    // Process levels and get saved directions
    for (const [levelName, levelStats] of Object.entries(statisticsData.levels)) {
        const upCompletions = levelStats.completionsUp || [];
        const downCompletions = levelStats.completionsDown || [];
        const allCompletions = [...upCompletions, ...downCompletions];
        
        // Find positions where this level appears
        const positions = [];
        if (statisticsData.levelDatabase) {
            Object.values(statisticsData.levelDatabase).forEach(stage => {
                stage.levels.forEach((level, index) => {
                    const actualLevelName = level.originalName || level.name;
                    if (actualLevelName === levelName) {
                        positions.push(index + 1);
                    }
                });
            });
        }
        
        const uniquePositions = [...new Set(positions)].sort((a, b) => a - b);
        const positionsText = uniquePositions.length > 0 ? uniquePositions.join(',') : '—';
        
        // Get saved direction from settings, or default to the direction with more completions
        let savedDirection = await getSavedDirectionForLevel(levelName);
        console.log(`DEBUG: Level "${levelName}" - savedDirection from settings: "${savedDirection}"`);
        
        // If no saved direction is set, default to the direction with more completions
        if (savedDirection === 'none') {
            if (upCompletions.length > downCompletions.length) {
                savedDirection = 'up';
            } else if (downCompletions.length > upCompletions.length) {
                savedDirection = 'down';
            } else if (upCompletions.length > 0) {
                // If equal, prefer 'up' if there are any completions
                savedDirection = 'up';
            } else {
                savedDirection = 'up'; // Default to 'up' even if no completions
            }
        }
        
        allLevels.push({
            name: levelName,
            positions: uniquePositions,
            positionsText: positionsText,
            upCompletions: upCompletions,
            downCompletions: downCompletions,
            allCompletions: allCompletions,
            savedDirection: savedDirection,
            upStats: calculateDirectionStats(upCompletions, false),
            downStats: calculateDirectionStats(downCompletions, false),
            combinedStats: calculateDirectionStats(allCompletions, false)
        });
    }
    
    // Filter levels based on mismatched directions if checkbox is checked
    const filteredLevels = showMismatched 
        ? allLevels.filter(level => isDirectionMismatched(level))
        : allLevels;
    
    // Sort levels
    filteredLevels.sort((a, b) => {
        let result = 0;
        const currentSort = sortingState.levels.column;
        
        switch (currentSort) {
            case 'name': 
                result = a.name.localeCompare(b.name);
                break;
            case 'positions': 
                const aPos = a.positions.length > 0 ? a.positions[0] : 999;
                const bPos = b.positions.length > 0 ? b.positions[0] : 999;
                result = aPos - bPos;
                break;
            case 'average': 
                result = (a.combinedStats.average || 0) - (b.combinedStats.average || 0);
                break;
            case 'count': 
                result = a.allCompletions.length - b.allCompletions.length;
                break;
            case 'savedDirection':
                const directionOrder = { 'up': 0, 'down': 1, 'none': 2 };
                result = directionOrder[a.savedDirection] - directionOrder[b.savedDirection];
                break;
            case 'meta':
                // Sort by meta direction: up < down < same
                const metaOrder = { 'up': 0, 'down': 1, 'same': 2, 'none': 3 };
                const aMeta = getMetaDirection(a);
                const bMeta = getMetaDirection(b);
                result = metaOrder[aMeta] - metaOrder[bMeta];
                break;
            default: 
                result = a.name.localeCompare(b.name);
        }
        
        return sortingState.levels.direction === 'desc' ? -result : result;
    });
    
    // Populate table with new two-line layout
    tbody.innerHTML = filteredLevels.map((level, index) => {
        const levelId = `level-${level.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const isEven = index % 2 === 0;
        const levelClass = isEven ? 'level-row even-level' : 'level-row odd-level';
        const directionClass = isEven ? 'direction-row even-level' : 'direction-row odd-level';
        
        return `
        <tr class="${levelClass}" data-level="${level.name}">
            <td rowspan="2" class="level-name-cell">
                <span class="level-name" onclick="openSettingsForLevel('${level.name}')">${level.name}</span>
                <button class="delete-btn" onclick="deleteLevel('${level.name}')" title="Delete level">×</button>
            </td>
            <td rowspan="2">${level.positionsText}</td>
            <td class="direction-label up">UP<br><small>${level.upStats.completions} comp</small></td>
            <td>${formatDirectionStats(level.upStats, 'up')}</td>
            <td>${formatDirectionStats(level.upStats, 'average')}</td>
            <td>${formatDirectionStats(level.upStats, 'best')}</td>
            <td>${formatDirectionStats(level.upStats, 'worst')}</td>
            <td class="meta-info">${calculateMetaInfo(level)}</td>
            <td rowspan="2" class="direction-selector">
                <button class="direction-btn up ${level.savedDirection === 'up' ? 'active' : ''}" 
                        onclick="setSavedDirection('${level.name}', 'up')">Up</button>
                <button class="direction-btn down ${level.savedDirection === 'down' ? 'active' : ''}" 
                        onclick="setSavedDirection('${level.name}', 'down')">Down</button>
            </td>
        </tr>
        <tr class="${directionClass}">
            <td class="direction-label down">DOWN<br><small>${level.downStats.completions} comp</small></td>
            <td>${formatDirectionStats(level.downStats, 'last')}</td>
            <td>${formatDirectionStats(level.downStats, 'average')}</td>
            <td>${formatDirectionStats(level.downStats, 'best')}</td>
            <td>${formatDirectionStats(level.downStats, 'worst')}</td>
            <td class="meta-info">—</td>
        </tr>
        `;
    }).join('');
    
    // Re-setup table sorting after populating
    setupTableSorting();
    
    // Update sort indicators
    updateSortIndicators('levels', sortingState.levels.column, sortingState.levels.direction);
}

function isDirectionMismatched(level) {
    const metaDirection = getMetaDirection(level);
    const savedDirection = level.savedDirection;
    
    // If meta direction is 'none' or 'same', consider it not mismatched
    if (metaDirection === 'none' || metaDirection === 'same') {
        return false;
    }
    
    // Check if meta and saved directions are different
    return metaDirection !== savedDirection;
}

function calculateDirectionStats(completions, ignoreExtremes) {
    if (completions.length === 0) {
        return {
            completions: 0,
            last: 0,
            average: 0,
            best: 0,
            worst: 0,
            trend: { direction: 'neutral', text: '—' }
        };
    }
    
    const filteredDurations = ignoreExtremes ? filterExtremes(completions) : completions;
    
    return {
        completions: completions.length,
        last: completions[completions.length - 1] || 0,
        average: filteredDurations.length > 0 ? Math.round(filteredDurations.reduce((a, b) => a + b, 0) / filteredDurations.length) : 0,
        best: filteredDurations.length > 0 ? Math.min(...filteredDurations) : 0,
        worst: filteredDurations.length > 0 ? Math.max(...filteredDurations) : 0,
        trend: calculateTrend(completions)
    };
}

function formatDirectionStats(stats, type) {
    if (stats.completions === 0) {
        return '<span class="no-data">—</span>';
    }
    
    let value = 0;
    switch (type) {
        case 'up':
        case 'last':
            value = stats.last;
            break;
        case 'average':
            value = stats.average;
            break;
        case 'best':
            value = stats.best;
            break;
        case 'worst':
            value = stats.worst;
            break;
    }
    
    return value > 0 ? formatDuration(value) : '<span class="no-data">—</span>';
}

function calculateMetaInfo(level) {
    const upBest = level.upStats.best;
    const downBest = level.downStats.best;
    const upAverage = level.upStats.average;
    const downAverage = level.downStats.average;
    
    // If no completions in either direction
    if (upBest === 0 && downBest === 0) {
        return '<span class="no-data">—</span>';
    }
    
    // If only one direction has completions
    if (upBest === 0) {
        return '<span class="meta-best-direction down">↓ DOWN</span>';
    }
    if (downBest === 0) {
        return '<span class="meta-best-direction up">↑ UP</span>';
    }
    
    // Calculate the difference between best times
    const bestTimeDiff = Math.abs(upBest - downBest);
    const threeSeconds = 3000; // 3 seconds in milliseconds
    
    // If best times are within 3 seconds, consider average times
    if (bestTimeDiff <= threeSeconds) {
        if (upAverage < downAverage) {
            return '<span class="meta-best-direction up">↑ UP</span>';
        } else if (downAverage < upAverage) {
            return '<span class="meta-best-direction down">↓ DOWN</span>';
        } else {
            return '<span class="meta-best-direction equal">= SAME</span>';
        }
    }
    
    // Best times are more than 3 seconds apart, use best times
    if (upBest < downBest) {
        return '<span class="meta-best-direction up">↑ UP</span>';
    } else if (downBest < upBest) {
        return '<span class="meta-best-direction down">↓ DOWN</span>';
    } else {
        return '<span class="meta-best-direction equal">= SAME</span>';
    }
}

function getMetaDirection(level) {
    const upBest = level.upStats.best;
    const downBest = level.downStats.best;
    const upAverage = level.upStats.average;
    const downAverage = level.downStats.average;
    
    // If no completions in either direction
    if (upBest === 0 && downBest === 0) {
        return 'none';
    }
    
    // If only one direction has completions
    if (upBest === 0) {
        return 'down';
    }
    if (downBest === 0) {
        return 'up';
    }
    
    // Calculate the difference between best times
    const bestTimeDiff = Math.abs(upBest - downBest);
    const threeSeconds = 3000; // 3 seconds in milliseconds
    
    // If best times are within 3 seconds, consider average times
    if (bestTimeDiff <= threeSeconds) {
        if (upAverage < downAverage) {
            return 'up';
        } else if (downAverage < upAverage) {
            return 'down';
        } else {
            return 'same';
        }
    }
    
    // Best times are more than 3 seconds apart, use best times
    if (upBest < downBest) {
        return 'up';
    } else if (downBest < upBest) {
        return 'down';
    } else {
        return 'same';
    }
}

async function getSavedDirectionForLevel(levelName) {
    // Get the scroll direction from the level's settings (same as saved direction)
    try {
        console.log(`DEBUG: getSavedDirectionForLevel called for "${levelName}"`);
        const settings = await ipcRenderer.invoke('get-level-settings', levelName.toLowerCase());
        const scrollDirection = settings.scrollDirection || 'up';
        console.log(`DEBUG: getSavedDirectionForLevel returned "${scrollDirection}" for "${levelName}"`);
        return scrollDirection;
    } catch (error) {
        console.error(`Error getting saved direction for ${levelName}:`, error);
        return 'up';
    }
}

async function openSettingsForLevel(levelName) {
    // Open settings modal with the level pre-populated
    console.log(`Opening settings for level: ${levelName}`);
    
    // Get the settings modal and level selector
    const settingsModal = document.getElementById('settingsModal');
    const levelSelect = document.getElementById('levelSelect');
    
    // Set the level in the selector
    levelSelect.value = levelName.toLowerCase();
    
    // Load settings for this level
    await loadSettingsForLevel(levelName.toLowerCase());
    
    // Show the modal
    settingsModal.style.display = 'flex';
}

async function setSavedDirection(levelName, direction) {
    // Set the scroll direction for a level (only 'up' or 'down' allowed)
    if (direction !== 'up' && direction !== 'down') {
        console.error(`Invalid direction: ${direction}. Only 'up' or 'down' allowed.`);
        return;
    }
    
    console.log(`Setting scroll direction for ${levelName} to ${direction}`);
    
    try {
        // Update the scroll direction in the settings
        console.log(`DEBUG: Calling IPC with levelName: "${levelName.toLowerCase()}", direction: "${direction}"`);
        const result = await ipcRenderer.invoke('save-level-settings', levelName.toLowerCase(), { scrollDirection: direction });
        console.log(`DEBUG: IPC result:`, result);
        
        if (result.success) {
            // Update the UI immediately
            updateDirectionButtons(levelName, direction);
            
            // Don't refresh the entire table, just update the button states
            console.log(`UI updated for ${levelName} - ${direction} button should now be active`);
            
            console.log(`Successfully set scroll direction for ${levelName} to ${direction}`);
        } else {
            console.error(`Failed to save direction: ${result.error}`);
            alert(`Error saving direction: ${result.error}`);
        }
    } catch (error) {
        console.error(`Error setting scroll direction for ${levelName}:`, error);
        alert(`Error setting scroll direction: ${error.message}`);
    }
}

function updateDirectionButtons(levelName, direction) {
    // Update the direction buttons for a specific level
    const levelRow = document.querySelector(`tr[data-level="${levelName}"]`);
    if (levelRow) {
        const directionSelector = levelRow.querySelector('.direction-selector');
        if (directionSelector) {
            // Remove active class from all buttons
            directionSelector.querySelectorAll('.direction-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add active class to the selected direction
            const selectedBtn = directionSelector.querySelector(`.direction-btn.${direction}`);
            if (selectedBtn) {
                selectedBtn.classList.add('active');
                console.log(`DEBUG: Set ${direction} button as active for level ${levelName}`);
            } else {
                console.error(`DEBUG: Could not find button with class .direction-btn.${direction} for level ${levelName}`);
            }
        } else {
            console.error(`DEBUG: Could not find direction selector for level ${levelName}`);
        }
    } else {
        console.error(`DEBUG: Could not find level row for ${levelName}`);
    }
}

async function deleteLevel(levelName) {
    // Delete a level with confirmation
    if (confirm(`Are you sure you want to delete the level "${levelName}"? This action cannot be undone.`)) {
        console.log(`Deleting level: ${levelName}`);
        
        try {
            // Call the main process to delete the level (keep original case for historical stats)
            const result = await ipcRenderer.invoke('delete-level', levelName);
            
            if (result.success) {
                console.log(`Successfully deleted level: ${levelName}`);
                
                // Refresh the statistics view
                await populateLevelsView();
                
                // Show success message
                alert(`Level "${levelName}" has been deleted successfully.`);
            } else {
                console.error(`Failed to delete level: ${result.error}`);
                alert(`Error deleting level: ${result.error}`);
            }
        } catch (error) {
            console.error(`Error deleting level ${levelName}:`, error);
            alert(`Error deleting level: ${error.message}`);
        }
    }
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

// Collapsible Panels Functionality
function initializeCollapsiblePanels() {
    const PANEL_STATE_KEY = 'panelStates';
    
    // Default state: all panels collapsed
    const defaultStates = {
        liveView: false,
        activityLog: false,
        detection: false,
        settings: false
    };
    
    // Load saved panel states from localStorage
    let panelStates = defaultStates;
    try {
        const saved = localStorage.getItem(PANEL_STATE_KEY);
        if (saved) {
            panelStates = { ...defaultStates, ...JSON.parse(saved) };
        }
    } catch (error) {
        console.error('Error loading panel states:', error);
    }
    
    // Apply saved states and set up toggle handlers
    const panels = document.querySelectorAll('.collapsible-panel');
    panels.forEach(panel => {
        const header = panel.querySelector('.panel-header');
        const panelId = header.getAttribute('data-panel');
        const isExpanded = panelStates[panelId];
        
        // Apply initial state
        if (!isExpanded) {
            panel.classList.add('collapsed');
        }
        
        // Add click handler
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking on a button or input inside header
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') {
                return;
            }
            
            // Toggle collapsed class
            const isCollapsed = panel.classList.toggle('collapsed');
            
            // Update state
            panelStates[panelId] = !isCollapsed;
            
            // Save to localStorage
            try {
                localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(panelStates));
            } catch (error) {
                console.error('Error saving panel state:', error);
            }
        });
    });
    
    console.log('Collapsible panels initialized with states:', panelStates);
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DEBUG: DOMContentLoaded event fired in renderer.js.');
    
    // Initialize activity log first
    initializeActivityLog();
    
    // Initialize collapsible panels
    initializeCollapsiblePanels();

    // Initialize Direction Mode radio group
    try {
        const currentMode = await ipcRenderer.invoke('get-direction-mode');
        const mode = currentMode || 'random';
        const map = { 
            saved: 'directionModeSaved', 
            random: 'directionModeRandom', 
            up: 'directionModeUp',
            best: 'directionModeBest',
            worst: 'directionModeWorst'
        };
        if (document.getElementById(map[mode])) {
            document.getElementById(map[mode]).checked = true;
        }
    } catch {}
    ['directionModeSaved','directionModeRandom','directionModeUp','directionModeBest','directionModeWorst'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', async () => {
                if (!el.checked) return;
                const mode = el.value; // saved | random | up | best | worst
                await ipcRenderer.invoke('set-direction-mode', mode);
                await ipcRenderer.invoke('renderer-log', `UI: directionMode set to ${mode}`);
            });
        }
    });
    
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
    // Keep system-status visible since it now includes daily stats
    const systemStatus = document.querySelector('.system-status');
    if (systemStatus) systemStatus.style.display = 'block';
} catch (e) { console.warn('Header compact styling failed to init', e); }

// Initialize level actions display (including custom triggers)
await updateLevelActionsDisplay();

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
    
    // Recalculate all-time bests
    const recalculateAllTimeBestsBtn = document.getElementById('recalculateAllTimeBestsBtn');
    if (recalculateAllTimeBestsBtn) {
        recalculateAllTimeBestsBtn.addEventListener('click', async () => {
            if (confirm('This will recalculate all-time best times from the current 5 completions saved for each level.\n\nThis is useful if statistics data becomes corrupted.\n\nContinue?')) {
                try {
                    const result = await ipcRenderer.invoke('recalculate-all-time-bests');
                    if (result.success) {
                        alert(`✅ Recalculation complete!\n\nUpdated: ${result.updatedCount} levels\nUnchanged: ${result.unchangedCount} levels`);
                    } else {
                        alert(`❌ Error: ${result.error}`);
                    }
                } catch (error) {
                    alert(`❌ Error recalculating: ${error.message}`);
                }
            }
        });
    }
    
    // Show/hide options based on action selection
    document.getElementById('perfectStartingPosition').addEventListener('change', (e) => {
        document.getElementById('perfectStartingPositionWaitOptions').style.display = 
            e.target.value === 'wait' ? 'block' : 'none';
        checkForChanges();
    });
    
    // Show/hide custom scroll options for after first build
    document.getElementById('scrollAfterFirstBuild').addEventListener('change', (e) => {
        document.getElementById('scrollAfterFirstBuildCustomOptions').style.display = 
            e.target.value === 'scrollCustom' ? 'block' : 'none';
        checkForChanges();
    });
    
    // Show/hide custom scroll options for after second build
    document.getElementById('scrollAfterSecondBuild').addEventListener('change', (e) => {
        document.getElementById('scrollAfterSecondBuildCustomOptions').style.display = 
            e.target.value === 'scrollCustom' ? 'block' : 'none';
        checkForChanges();
    });
    
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
    
    // Special handler for scroll direction changes - save old direction, load new direction
    document.getElementById('scrollDirection').addEventListener('change', async (e) => {
        await ipcRenderer.invoke('renderer-log', 'DIR: handler fired');
        const newDirection = e.target.value;
        const oldDirection = originalSettings.scrollDirection;
        await ipcRenderer.invoke('renderer-log', `DIR: old=${oldDirection} new=${newDirection}`);
        
        if (newDirection === oldDirection) {
            console.error('Same direction, returning');
            return; // No change
        }
        
        // Get current form settings and auto-save silently
        const currentSettings = getCurrentFormSettings();
        await ipcRenderer.invoke('renderer-log', `DIR: current form (pre-save old): ${JSON.stringify(currentSettings)}`);
        
        // Always auto-save the current direction's settings before switching (no dialog)
        const customTriggersForOldDir = getCustomTriggersFromForm();
        const directionSpecificSettings = {
            optimized: currentSettings.optimized,
            perfectStartingPosition: currentSettings.perfectStartingPosition,
            scrollAfterFirstBuild: currentSettings.scrollAfterFirstBuild,
            scrollAfterSecondBuild: currentSettings.scrollAfterSecondBuild,
            firstBuildAction: currentSettings.firstBuildAction,
            secondBuildAction: currentSettings.secondBuildAction,
            customTriggers: customTriggersForOldDir
        };
        await ipcRenderer.invoke('renderer-log', `DIR: auto-saving oldDirection ${oldDirection} settings: ${JSON.stringify(directionSpecificSettings)}`);
        await ipcRenderer.invoke('save-direction-settings', currentEditingLevel, oldDirection, directionSpecificSettings);
        
        // Save the new scrollDirection to the file
        await ipcRenderer.invoke('renderer-log', `DIR: writing scrollDirection=${newDirection} for ${currentEditingLevel}`);
        await ipcRenderer.invoke('save-level-settings', currentEditingLevel, { scrollDirection: newDirection });
        
        // Force reload settings from file (clears cache)
        await ipcRenderer.invoke('renderer-log', 'DIR: reloading settings from disk');
        await ipcRenderer.invoke('reload-settings');
        
        // Now load settings for the NEW direction explicitly (not merged based on saved scrollDirection)
        const globalSettings = await ipcRenderer.invoke('get-level-settings', currentEditingLevel);
        const directionSettings = await ipcRenderer.invoke('get-direction-settings', currentEditingLevel, newDirection);
        
        // Merge global + direction-specific settings manually
        const settings = {
            ...directionSettings,
            doResearch: globalSettings.doResearch,
            scrollDirection: newDirection,  // Use the NEW direction, not the saved one
            blueBoxClickHoldDuration: globalSettings.blueBoxClickHoldDuration,
            maxBuildTimeMs: globalSettings.maxBuildTimeMs
        };
        
        await ipcRenderer.invoke('renderer-log', `DIR: loaded direction-specific settings for ${newDirection}: ${JSON.stringify(settings)}`);
        
        // CRITICAL: Update originalSettings FIRST before touching any form elements
        // This prevents change listeners from interfering
        originalSettings = {
            doResearch: settings.doResearch,
            scrollDirection: settings.scrollDirection,
            blueBoxClickHoldDuration: settings.blueBoxClickHoldDuration,
            optimized: settings.optimized,
            scrollAfterFirstBuild: settings.scrollAfterFirstBuild,
            scrollAfterSecondBuild: settings.scrollAfterSecondBuild,
            perfectStartingPosition: settings.perfectStartingPosition,
            firstBuildAction: settings.firstBuildAction,
            secondBuildAction: settings.secondBuildAction,
            maxBuildTimeMs: settings.maxBuildTimeMs
        };
        await ipcRenderer.invoke('renderer-log', `DIR: set originalSettings to: ${JSON.stringify(originalSettings)}`);
        
        // Now populate the form
        document.getElementById('doResearch').checked = settings.doResearch;
        document.getElementById('blueBoxClickHoldDuration').value = settings.blueBoxClickHoldDuration;
        document.getElementById('optimized').checked = settings.optimized !== undefined ? settings.optimized : (newDirection === 'up');
        
        // Load scroll after first build settings (handle backward compatibility)
        const scrollAfterFirst = settings.scrollAfterFirstBuild || 
            (settings.scrollToBottomAfterFirstBuild ? { action: 'scrollToBottom', direction: 'down', distance: 300 } : { action: 'nothing', direction: 'down', distance: 300 });
        console.log('DEBUG: Direction change - scrollAfterFirstBuild:', JSON.stringify(scrollAfterFirst));
        document.getElementById('scrollAfterFirstBuild').value = scrollAfterFirst.action;
        document.getElementById('scrollAfterFirstBuildDirection').value = scrollAfterFirst.direction || 'down';
        document.getElementById('scrollAfterFirstBuildDistance').value = scrollAfterFirst.distance || 300;
        document.getElementById('scrollAfterFirstBuildCustomOptions').style.display = scrollAfterFirst.action === 'scrollCustom' ? 'block' : 'none';
        
        // Load scroll after second build settings (handle backward compatibility)
        const scrollAfterSecond = settings.scrollAfterSecondBuild || 
            (settings.scrollToBottomAfterSecondBuild ? { action: 'scrollToBottom', direction: 'down', distance: 300 } : { action: 'nothing', direction: 'down', distance: 300 });
        console.log('DEBUG: Direction change - scrollAfterSecondBuild:', JSON.stringify(scrollAfterSecond));
        document.getElementById('scrollAfterSecondBuild').value = scrollAfterSecond.action;
        document.getElementById('scrollAfterSecondBuildDirection').value = scrollAfterSecond.direction || 'down';
        document.getElementById('scrollAfterSecondBuildDistance').value = scrollAfterSecond.distance || 300;
        document.getElementById('scrollAfterSecondBuildCustomOptions').style.display = scrollAfterSecond.action === 'scrollCustom' ? 'block' : 'none';
        
        // Handle perfectStartingPosition
        if (typeof settings.perfectStartingPosition === 'object') {
            document.getElementById('perfectStartingPosition').value = settings.perfectStartingPosition.action;
            document.getElementById('perfectStartingPositionWaitTime').value = settings.perfectStartingPosition.waitTimeMs || 1000;
            document.getElementById('perfectStartingPositionWaitOptions').style.display = 
                settings.perfectStartingPosition.action === 'wait' ? 'block' : 'none';
        } else {
            document.getElementById('perfectStartingPosition').value = settings.perfectStartingPosition;
            document.getElementById('perfectStartingPositionWaitOptions').style.display = 'none';
        }
        
        // First build action
        console.log('DEBUG: Loading first build action:', JSON.stringify(settings.firstBuildAction, null, 2));
        document.getElementById('firstBuildAction').value = settings.firstBuildAction.action;
        document.getElementById('firstBuildTriggerTime').value = settings.firstBuildAction.triggerTimeMs || '';
        document.getElementById('firstBuildClickOffScrollDirection').value = settings.firstBuildAction.clickOffAndScrollDirection || 'down';
        document.getElementById('firstBuildClickOffScrollDistance').value = settings.firstBuildAction.clickOffAndScrollDistance || 150;
        const firstOpts = settings.firstBuildAction.clickaroundOptions || {};
        document.getElementById('firstBuildExcludeRedBlobs').checked = firstOpts.excludeRedBlobs !== undefined ? firstOpts.excludeRedBlobs : true;
        document.getElementById('firstBuildClickaroundChunks').value = firstOpts.clickaroundChunks ?? 3;
        document.getElementById('firstBuildScrollUpDistance').value = firstOpts.scrollUpDistance ?? 200;
        document.getElementById('firstBuildScrollUpCount').value = firstOpts.scrollUpCount ?? 5;
        document.getElementById('firstBuildInitialScrollDown').value = firstOpts.initialScrollDown ?? 150;
        document.getElementById('firstBuildScrollToBottomAtEnd').checked = firstOpts.scrollToBottomAtEnd || false;
        document.getElementById('firstBuildClickaroundOptions').style.display = 
            settings.firstBuildAction.action === 'clickaround' ? 'block' : 'none';
        document.getElementById('firstBuildClickOffScrollDistance').parentElement.style.display = 
            settings.firstBuildAction.action === 'click_off_and_scroll' ? 'block' : 'none';
        
        // Second build action
        console.log('DEBUG: Loading second build action:', JSON.stringify(settings.secondBuildAction, null, 2));
        document.getElementById('secondBuildAction').value = settings.secondBuildAction.action;
        document.getElementById('secondBuildTriggerTime').value = settings.secondBuildAction.triggerTimeMs || '';
        document.getElementById('secondBuildClickOffScrollDirection').value = settings.secondBuildAction.clickOffAndScrollDirection || 'down';
        document.getElementById('secondBuildClickOffScrollDistance').value = settings.secondBuildAction.clickOffAndScrollDistance || 150;
        const secondOpts = settings.secondBuildAction.clickaroundOptions || {};
        document.getElementById('secondBuildExcludeRedBlobs').checked = secondOpts.excludeRedBlobs !== undefined ? secondOpts.excludeRedBlobs : true;
        document.getElementById('secondBuildClickaroundChunks').value = secondOpts.clickaroundChunks ?? 3;
        document.getElementById('secondBuildScrollUpDistance').value = secondOpts.scrollUpDistance ?? 200;
        document.getElementById('secondBuildScrollUpCount').value = secondOpts.scrollUpCount ?? 5;
        document.getElementById('secondBuildInitialScrollDown').value = secondOpts.initialScrollDown ?? 150;
        document.getElementById('secondBuildScrollToBottomAtEnd').checked = secondOpts.scrollToBottomAtEnd || false;
        document.getElementById('secondBuildClickaroundOptions').style.display = 
            settings.secondBuildAction.action === 'clickaround' ? 'block' : 'none';
        document.getElementById('secondBuildClickOffScrollDistance').parentElement.style.display = 
            settings.secondBuildAction.action === 'click_off_and_scroll' ? 'block' : 'none';
        
        // Load custom triggers for the new direction
        await ipcRenderer.invoke('renderer-log', `DIR: loading custom triggers for ${newDirection}`);
        await loadCustomTriggersForLevel(currentEditingLevel, newDirection);
        
        // originalSettings was already set at the beginning
        // Disable save button since we just loaded saved settings
        await ipcRenderer.invoke('renderer-log', `DIR: calling checkForChanges`);
        checkForChanges();
        
        // Update the direction button text
        updateDirectionButtonText(newDirection);
    });
    
    // Direction Toggle Button Handler
    document.getElementById('directionToggleBtn').addEventListener('click', () => {
        const currentDirection = document.getElementById('scrollDirection').value;
        const newDirection = currentDirection === 'up' ? 'down' : 'up';
        
        // Update the hidden input
        document.getElementById('scrollDirection').value = newDirection;
        
        // Trigger the change event to use the existing handler logic
        const event = new Event('change', { bubbles: true });
        document.getElementById('scrollDirection').dispatchEvent(event);
    });
    
    // Add change listeners to all form inputs to track modifications
    // NOTE: scrollDirection has its own special handler above, don't add it here
    const formInputs = [
        'doResearch', 'optimized', 'blueBoxClickHoldDuration',
        'scrollAfterFirstBuild', 'scrollAfterFirstBuildDirection', 'scrollAfterFirstBuildDistance',
        'scrollAfterSecondBuild', 'scrollAfterSecondBuildDirection', 'scrollAfterSecondBuildDistance',
        'perfectStartingPosition', 'perfectStartingPositionWaitTime',
        'firstBuildAction', 'firstBuildTriggerTime', 'firstBuildClickOffScrollDirection', 'firstBuildClickOffScrollDistance',
        'firstBuildExcludeRedBlobs', 'firstBuildClickaroundChunks', 'firstBuildScrollUpDistance', 'firstBuildScrollUpCount',
        'firstBuildInitialScrollDown', 'firstBuildScrollToBottomAtEnd',
        'secondBuildAction', 'secondBuildTriggerTime', 'secondBuildClickOffScrollDirection', 'secondBuildClickOffScrollDistance',
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

// Update direction button text based on current direction
function updateDirectionButtonText(direction) {
    const btn = document.getElementById('directionToggleBtn');
    const text = document.getElementById('directionToggleText');
    if (btn && text) {
        if (direction === 'up') {
            text.textContent = '↑ UP';
            btn.title = 'Click to switch to DOWN';
        } else {
            text.textContent = '↓ DOWN';
            btn.title = 'Click to switch to UP';
        }
    }
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
    const perfectStartingPositionAction = document.getElementById('perfectStartingPosition').value;
    
    return {
        doResearch: document.getElementById('doResearch').checked,
        scrollDirection: document.getElementById('scrollDirection').value,
        optimized: document.getElementById('optimized').checked,
        blueBoxClickHoldDuration: parseInt(document.getElementById('blueBoxClickHoldDuration').value),
        scrollAfterFirstBuild: {
            action: document.getElementById('scrollAfterFirstBuild').value,
            direction: document.getElementById('scrollAfterFirstBuildDirection').value,
            distance: parseInt(document.getElementById('scrollAfterFirstBuildDistance').value) || 300
        },
        scrollAfterSecondBuild: {
            action: document.getElementById('scrollAfterSecondBuild').value,
            direction: document.getElementById('scrollAfterSecondBuildDirection').value,
            distance: parseInt(document.getElementById('scrollAfterSecondBuildDistance').value) || 300
        },
        perfectStartingPosition: {
            action: perfectStartingPositionAction,
            waitTimeMs: perfectStartingPositionAction === 'wait' ? parseInt(document.getElementById('perfectStartingPositionWaitTime').value) || 1000 : null
        },
        firstBuildAction: {
            action: firstBuildAction,
            triggerTimeMs: parseInt(document.getElementById('firstBuildTriggerTime').value) || null,
            clickOffAndScrollDirection: document.getElementById('firstBuildClickOffScrollDirection').value,
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
            clickOffAndScrollDirection: document.getElementById('secondBuildClickOffScrollDirection').value,
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
    
    // Update the direction button text to match
    updateDirectionButtonText(settings.scrollDirection);
    
    // Set optimized checkbox with defaults: true for 'up', false for 'down'
    document.getElementById('optimized').checked = settings.optimized !== undefined 
        ? settings.optimized 
        : (settings.scrollDirection === 'up' ? true : false);
    document.getElementById('blueBoxClickHoldDuration').value = settings.blueBoxClickHoldDuration;
    
    // Load scroll after first build settings (handle backward compatibility)
    const scrollAfterFirst = settings.scrollAfterFirstBuild || 
        (settings.scrollToBottomAfterFirstBuild ? { action: 'scrollToBottom', direction: 'down', distance: 300 } : { action: 'nothing', direction: 'down', distance: 300 });
    console.log('DEBUG: loadSettingsIntoForm - scrollAfterFirstBuild:', JSON.stringify(scrollAfterFirst));
    document.getElementById('scrollAfterFirstBuild').value = scrollAfterFirst.action;
    document.getElementById('scrollAfterFirstBuildDirection').value = scrollAfterFirst.direction || 'down';
    document.getElementById('scrollAfterFirstBuildDistance').value = scrollAfterFirst.distance || 300;
    document.getElementById('scrollAfterFirstBuildCustomOptions').style.display = scrollAfterFirst.action === 'scrollCustom' ? 'block' : 'none';
    
    // Load scroll after second build settings (handle backward compatibility)
    const scrollAfterSecond = settings.scrollAfterSecondBuild || 
        (settings.scrollToBottomAfterSecondBuild ? { action: 'scrollToBottom', direction: 'down', distance: 300 } : { action: 'nothing', direction: 'down', distance: 300 });
    console.log('DEBUG: loadSettingsIntoForm - scrollAfterSecondBuild:', JSON.stringify(scrollAfterSecond));
    document.getElementById('scrollAfterSecondBuild').value = scrollAfterSecond.action;
    document.getElementById('scrollAfterSecondBuildDirection').value = scrollAfterSecond.direction || 'down';
    document.getElementById('scrollAfterSecondBuildDistance').value = scrollAfterSecond.distance || 300;
    document.getElementById('scrollAfterSecondBuildCustomOptions').style.display = scrollAfterSecond.action === 'scrollCustom' ? 'block' : 'none';
    
    // Handle perfectStartingPosition (can be string or object for backward compatibility)
    if (typeof settings.perfectStartingPosition === 'object') {
        document.getElementById('perfectStartingPosition').value = settings.perfectStartingPosition.action;
        document.getElementById('perfectStartingPositionWaitTime').value = settings.perfectStartingPosition.waitTimeMs || 1000;
        document.getElementById('perfectStartingPositionWaitOptions').style.display = 
            settings.perfectStartingPosition.action === 'wait' ? 'block' : 'none';
    } else {
        // Backward compatibility: old settings stored as string
    document.getElementById('perfectStartingPosition').value = settings.perfectStartingPosition;
        document.getElementById('perfectStartingPositionWaitTime').value = 1000;
        document.getElementById('perfectStartingPositionWaitOptions').style.display = 'none';
    }
    
    // First build action
    document.getElementById('firstBuildAction').value = settings.firstBuildAction.action;
    document.getElementById('firstBuildTriggerTime').value = settings.firstBuildAction.triggerTimeMs || '';
    document.getElementById('firstBuildClickOffScrollDirection').value = settings.firstBuildAction.clickOffAndScrollDirection || 'down';
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
    document.getElementById('secondBuildClickOffScrollDirection').value = settings.secondBuildAction.clickOffAndScrollDirection || 'down';
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
    
    // Load custom triggers
    await loadCustomTriggersForLevel(levelName);
    
    // Store original settings for change detection
    originalSettings = getCurrentFormSettings();
    
    // Disable save button initially (no changes yet)
    const saveBtn = document.getElementById('saveSettingsBtn');
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.5';
    saveBtn.style.cursor = 'not-allowed';
}

// Load custom triggers for a level in settings
async function loadCustomTriggersForLevel(levelName, direction = null) {
    try {
        const triggers = await ipcRenderer.invoke('get-custom-triggers', levelName, direction);
        console.log('DEBUG: loadCustomTriggersForLevel - Loaded triggers:', JSON.stringify(triggers, null, 2));
        const triggerTypes = await ipcRenderer.invoke('get-trigger-types');
        const triggerActions = await ipcRenderer.invoke('get-trigger-actions');
        
        const triggersList = document.getElementById('triggersList');
        triggersList.innerHTML = '';
        
        triggers.forEach((trigger, index) => {
            console.log(`DEBUG: loadCustomTriggersForLevel - Loading trigger ${index}: timing="${trigger.timing || 'during'}" (will default if undefined)`);
            addTriggerSettingsItem(trigger, index, triggerTypes, triggerActions);
        });
        
        // Setup add trigger button
        const addTriggerBtn = document.getElementById('addTriggerSettingsBtn');
        addTriggerBtn.onclick = () => addNewTriggerSettings(triggerTypes, triggerActions);
        
    } catch (error) {
        console.error('Error loading custom triggers for level:', error);
    }
}

function addTriggerSettingsItem(trigger, index, triggerTypes, triggerActions) {
    const triggersList = document.getElementById('triggersList');
    
    const triggerDiv = document.createElement('div');
    triggerDiv.className = 'trigger-settings-item';
    
    // Determine the correct input field based on trigger type
    const triggerType = trigger.triggerType || 'buildNumber';
    let valueInput = '';
    if (triggerType === 'buildNumber') {
        valueInput = `<input type="number" class="trigger-settings-value" data-index="${index}" data-field="triggerValue" 
                   value="${trigger.triggerValue || ''}" placeholder="Build #" min="3" max="12" step="1">`;
    } else if (triggerType === 'timeSpent') {
        valueInput = `<input type="number" class="trigger-settings-value" data-index="${index}" data-field="triggerValue" 
                   value="${trigger.triggerValue || ''}" placeholder="Time (ms)" min="1000" step="1000">`;
    } else if (triggerType === 'buildName') {
        valueInput = `<input type="text" class="trigger-settings-value" data-index="${index}" data-field="triggerValue" 
                   value="${trigger.triggerValue || ''}" placeholder="Build name">`;
    }
    
    const triggerTiming = trigger.timing || 'during';
    console.log(`DEBUG: addTriggerSettingsItem ${index} - Rendering timing dropdown with value: "${triggerTiming}"`);
    
    triggerDiv.innerHTML = `
        <div class="trigger-basic-settings">
            <select class="trigger-settings-timing" data-index="${index}" data-field="timing">
                <option value="during" ${triggerTiming === 'during' ? 'selected' : ''}>DURING Build</option>
                <option value="after" ${triggerTiming === 'after' ? 'selected' : ''}>AFTER Build</option>
            </select>
            <select class="trigger-settings-type" data-index="${index}" data-field="triggerType">
                ${triggerTypes.map(type => 
                    `<option value="${type.value}" ${trigger.triggerType === type.value ? 'selected' : ''}>${type.label}</option>`
                ).join('')}
            </select>
            <span class="trigger-value-container" data-index="${index}">
                ${valueInput}
            </span>
            <select class="trigger-settings-action" data-index="${index}" data-field="action">
                ${triggerActions.map(action => 
                    `<option value="${action.value}" ${trigger.action === action.value ? 'selected' : ''}>${action.label}</option>`
                ).join('')}
            </select>
            <span class="trigger-time-container" id="triggerTimeContainer${index}" data-index="${index}">
                <span class="trigger-time-label">After (ms):</span>
                <input type="number" class="trigger-settings-time" id="triggerTime${index}" data-index="${index}" data-field="actionParams" 
                       value="${trigger.actionParams || ''}" placeholder="Time" min="1000" step="1000">
            </span>
            <span class="trigger-distance-container" id="triggerDistanceContainer${index}" data-index="${index}" style="display:none;">
                <span class="trigger-distance-label">Distance (px):</span>
                <input type="number" class="trigger-settings-distance" id="triggerDistance${index}" data-index="${index}" data-field="actionDistance" 
                       value="${trigger.actionDistance || ''}" placeholder="Distance" min="50" step="10">
            </span>
            <button class="remove-trigger-settings-btn" data-index="${index}">×</button>
        </div>
        <div class="trigger-clickaround-options" id="triggerClickaroundOptions${index}" style="display: none;">
            <h5>Click Around Options</h5>
            <div class="clickaround-settings-grid">
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="triggerExcludeRedBlobs${index}" ${trigger.clickaroundOptions?.excludeRedBlobs ? 'checked' : ''}>
                        Exclude Red Blobs
                    </label>
                </div>
                <div class="setting-item">
                    <label for="triggerClickaroundChunks${index}">Number of Chunks:</label>
                    <input type="number" id="triggerClickaroundChunks${index}" min="0" max="10" step="1" 
                           value="${trigger.clickaroundOptions?.clickaroundChunks ?? 3}">
                </div>
                <div class="setting-item">
                    <label for="triggerScrollUpDistance${index}">Scroll Up Distance (px):</label>
                    <input type="number" id="triggerScrollUpDistance${index}" min="0" max="500" step="10" 
                           value="${trigger.clickaroundOptions?.scrollUpDistance ?? 200}">
                </div>
                <div class="setting-item">
                    <label for="triggerScrollUpCount${index}">Scroll Up Count:</label>
                    <input type="number" id="triggerScrollUpCount${index}" min="0" max="10" step="1" 
                           value="${trigger.clickaroundOptions?.scrollUpCount ?? 5}">
                </div>
                <div class="setting-item">
                    <label for="triggerInitialScrollDown${index}">Initial Scroll Down (px):</label>
                    <input type="number" id="triggerInitialScrollDown${index}" min="0" max="500" step="10" 
                           value="${trigger.clickaroundOptions?.initialScrollDown ?? 150}">
                </div>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="triggerScrollToBottomAtEnd${index}" ${trigger.clickaroundOptions?.scrollToBottomAtEnd ? 'checked' : ''}>
                        Scroll to Bottom at End
                    </label>
                </div>
            </div>
        </div>
    `;
    
    triggersList.appendChild(triggerDiv);
    
    // Add event listeners
    const selects = triggerDiv.querySelectorAll('select');
    const inputs = triggerDiv.querySelectorAll('input[type="number"], input[type="text"]');
    const checkboxes = triggerDiv.querySelectorAll('input[type="checkbox"]');
    const removeBtn = triggerDiv.querySelector('.remove-trigger-settings-btn');
    const actionSelect = triggerDiv.querySelector('.trigger-settings-action');
    const typeSelect = triggerDiv.querySelector('.trigger-settings-type');
    const timingSelect = triggerDiv.querySelector('.trigger-settings-timing');
    
    // Function to update time and distance fields based on timing and action
    const updateParamsField = () => {
        const timing = timingSelect.value;
        const action = actionSelect.value;
        const timeContainer = document.getElementById(`triggerTimeContainer${index}`);
        const distanceContainer = document.getElementById(`triggerDistanceContainer${index}`);
        
        // Determine what to show based on timing and action
        if (timing === 'after') {
            // AFTER build triggers
            timeContainer.style.display = 'none'; // Never show time for after triggers
            
            if (action === 'scrollUp' || action === 'scrollDown') {
                distanceContainer.style.display = 'inline';
            } else if (action === 'scrollToTop' || action === 'scrollToBottom') {
                distanceContainer.style.display = 'none'; // No distance needed for scroll to top/bottom
            } else if (action === 'clickAround') {
                distanceContainer.style.display = 'none';
            } else {
                distanceContainer.style.display = 'none';
            }
        } else {
            // DURING build triggers
            if (action === 'scrollUp' || action === 'scrollDown') {
                timeContainer.style.display = 'inline';
                distanceContainer.style.display = 'inline';
            } else if (action === 'scrollToTop' || action === 'scrollToBottom') {
                timeContainer.style.display = 'inline';
                distanceContainer.style.display = 'none';
            } else if (action === 'clickAround') {
                timeContainer.style.display = 'inline';
                distanceContainer.style.display = 'none';
            } else {
                timeContainer.style.display = 'none';
                distanceContainer.style.display = 'none';
            }
        }
    };
    
    // Call on initial load
    updateParamsField();
    
    [...selects, ...inputs, ...checkboxes].forEach(element => {
        element.addEventListener('change', () => updateTriggerSettings(index));
    });
    
    // Special handler for trigger type select to update value field
    typeSelect.addEventListener('change', () => {
        const valueContainer = triggerDiv.querySelector('.trigger-value-container');
        
        // Clear the field when changing trigger type
        let newValueInput = '';
        if (typeSelect.value === 'buildNumber') {
            newValueInput = `<input type="number" class="trigger-settings-value" data-index="${index}" data-field="triggerValue" 
                       value="" placeholder="Build #" min="3" max="12" step="1">`;
        } else if (typeSelect.value === 'timeSpent') {
            newValueInput = `<input type="number" class="trigger-settings-value" data-index="${index}" data-field="triggerValue" 
                       value="" placeholder="Time (ms)" min="1000" step="1000">`;
        } else if (typeSelect.value === 'buildName') {
            newValueInput = `<input type="text" class="trigger-settings-value" data-index="${index}" data-field="triggerValue" 
                       value="" placeholder="Build name">`;
        }
        
        valueContainer.innerHTML = newValueInput;
        
        // Re-add event listener to new input
        const newInput = valueContainer.querySelector('.trigger-settings-value');
        if (newInput) {
            newInput.addEventListener('change', () => updateTriggerSettings(index));
            newInput.addEventListener('input', () => updateTriggerSettings(index));
        }
        
        updateTriggerSettings(index);
    });
    
    // Special handler for timing select to update params field
    timingSelect.addEventListener('change', () => {
        updateParamsField();
        updateTriggerSettings(index);
    });
    
    // Special handler for action select to show/hide clickaround options and update params field
    actionSelect.addEventListener('change', () => {
        const clickaroundOptions = triggerDiv.querySelector(`#triggerClickaroundOptions${index}`);
        if (actionSelect.value === 'clickAround') {
            clickaroundOptions.style.display = 'block';
        } else {
            clickaroundOptions.style.display = 'none';
        }
        updateParamsField();
        updateTriggerSettings(index);
    });
    
    // Show clickaround options if action is already clickAround
    if (trigger.action === 'clickAround') {
        const clickaroundOptions = triggerDiv.querySelector(`#triggerClickaroundOptions${index}`);
        clickaroundOptions.style.display = 'block';
    }
    
    removeBtn.addEventListener('click', () => removeTriggerSettings(index));
}

async function addNewTriggerSettings(triggerTypes, triggerActions) {
    const newTrigger = {
        timing: 'during', // Default to 'during'
        triggerType: 'buildNumber',
        triggerValue: 3, // Default to 3 (min for buildNumber)
        action: 'clickAround',
        actionParams: 5000,
        actionDistance: 200
    };
    
    const triggersList = document.getElementById('triggersList');
    const index = triggersList.children.length;
    addTriggerSettingsItem(newTrigger, index, triggerTypes, triggerActions);
    
    // Mark settings as changed
    markSettingsAsChanged();
}

async function updateTriggerSettings(index) {
    // Mark settings as changed
    markSettingsAsChanged();
}

async function removeTriggerSettings(index) {
    const triggersList = document.getElementById('triggersList');
    const triggerItem = triggersList.children[index];
    if (triggerItem) {
        triggerItem.remove();
        
        // Re-index remaining items
        Array.from(triggersList.children).forEach((item, newIndex) => {
            const selects = item.querySelectorAll('select');
            const inputs = item.querySelectorAll('input[type="number"]');
            const removeBtn = item.querySelector('.remove-trigger-settings-btn');
            
            [...selects, ...inputs, removeBtn].forEach(element => {
                element.setAttribute('data-index', newIndex);
            });
        });
        
        // Mark settings as changed
        markSettingsAsChanged();
    }
}

function markSettingsAsChanged() {
    const saveBtn = document.getElementById('saveSettingsBtn');
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
    saveBtn.style.cursor = 'pointer';
}

function getCustomTriggersFromForm() {
    const triggersList = document.getElementById('triggersList');
    const triggers = [];
    
    Array.from(triggersList.children).forEach((triggerItem) => {
        // Get the actual index from the data-index attribute (not the forEach index)
        const actualIndex = triggerItem.querySelector('.trigger-settings-type')?.getAttribute('data-index');
        
        const timingElement = triggerItem.querySelector('.trigger-settings-timing');
        const timing = timingElement ? timingElement.value : 'during';
        const triggerType = triggerItem.querySelector('.trigger-settings-type').value;
        const triggerValueRaw = triggerItem.querySelector('.trigger-settings-value').value;
        
        // Parse value based on trigger type
        let triggerValue;
        if (triggerType === 'buildName') {
            triggerValue = triggerValueRaw; // Keep as string for build names
        } else {
            triggerValue = parseInt(triggerValueRaw) || (triggerType === 'buildNumber' ? 3 : 1000);
        }
        
        const timeInput = triggerItem.querySelector('.trigger-settings-time');
        const distanceInput = triggerItem.querySelector('.trigger-settings-distance');
        
        const trigger = {
            timing: timing || 'during', // Default to 'during' if not set
            triggerType: triggerType,
            triggerValue: triggerValue,
            action: triggerItem.querySelector('.trigger-settings-action').value,
            actionParams: timeInput ? (parseInt(timeInput.value) || null) : null,
            actionDistance: distanceInput ? (parseInt(distanceInput.value) || null) : null
        };
        
        console.log(`DEBUG: getCustomTriggersFromForm - Trigger ${actualIndex}: timing="${timing}", type="${triggerType}", value="${triggerValue}"`);
        
        // Add clickaround options if action is clickAround
        if (trigger.action === 'clickAround') {
            const excludeRedBlobsEl = document.getElementById(`triggerExcludeRedBlobs${actualIndex}`);
            const clickaroundChunksEl = document.getElementById(`triggerClickaroundChunks${actualIndex}`);
            const scrollUpDistanceEl = document.getElementById(`triggerScrollUpDistance${actualIndex}`);
            const scrollUpCountEl = document.getElementById(`triggerScrollUpCount${actualIndex}`);
            const initialScrollDownEl = document.getElementById(`triggerInitialScrollDown${actualIndex}`);
            const scrollToBottomAtEndEl = document.getElementById(`triggerScrollToBottomAtEnd${actualIndex}`);
            
            trigger.clickaroundOptions = {
                excludeRedBlobs: excludeRedBlobsEl?.checked ?? false,
                clickaroundChunks: clickaroundChunksEl ? parseInt(clickaroundChunksEl.value) : 3,
                scrollUpDistance: scrollUpDistanceEl ? parseInt(scrollUpDistanceEl.value) : 200,
                scrollUpCount: scrollUpCountEl ? parseInt(scrollUpCountEl.value) : 5,
                initialScrollDown: initialScrollDownEl ? parseInt(initialScrollDownEl.value) : 150,
                scrollToBottomAtEnd: scrollToBottomAtEndEl?.checked ?? false
            };
        }
        
        triggers.push(trigger);
    });
    
    return triggers;
}

async function saveCurrentSettings() {
    const settings = getCurrentFormSettings();
    const currentDirection = settings.scrollDirection;
    
    // Get custom triggers from the settings form
    const customTriggers = getCustomTriggersFromForm();
    console.log('DEBUG: saveCurrentSettings - Saving custom triggers:', JSON.stringify(customTriggers, null, 2));
    console.log('DEBUG: saveCurrentSettings - scrollAfterFirstBuild:', JSON.stringify(settings.scrollAfterFirstBuild));
    console.log('DEBUG: saveCurrentSettings - scrollAfterSecondBuild:', JSON.stringify(settings.scrollAfterSecondBuild));
    console.log('DEBUG: saveCurrentSettings - firstBuildAction.clickOffAndScrollDirection:', settings.firstBuildAction.clickOffAndScrollDirection);
    console.log('DEBUG: saveCurrentSettings - secondBuildAction.clickOffAndScrollDirection:', settings.secondBuildAction.clickOffAndScrollDirection);
    
    // Separate global settings from direction-specific settings
    const globalSettings = {
        doResearch: settings.doResearch,
        scrollDirection: settings.scrollDirection,
        blueBoxClickHoldDuration: settings.blueBoxClickHoldDuration
    };
    
    const directionSpecificSettings = {
        optimized: settings.optimized,
        perfectStartingPosition: settings.perfectStartingPosition,
        scrollAfterFirstBuild: settings.scrollAfterFirstBuild,
        scrollAfterSecondBuild: settings.scrollAfterSecondBuild,
        firstBuildAction: settings.firstBuildAction,
        secondBuildAction: settings.secondBuildAction,
        customTriggers: customTriggers  // Custom triggers are direction-specific
    };
    
    // Save global settings
    const globalResult = await ipcRenderer.invoke('save-level-settings', currentEditingLevel, globalSettings);
    
    // Save direction-specific settings
    const directionResult = await ipcRenderer.invoke('save-direction-settings', currentEditingLevel, currentDirection, directionSpecificSettings);
    
    if (globalResult.success && directionResult.success) {
        // Update original settings to match current (no changes now)
        originalSettings = getCurrentFormSettings();
        
        // Disable save button (settings are now saved)
        const saveBtn = document.getElementById('saveSettingsBtn');
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
        saveBtn.style.cursor = 'not-allowed';
        
        // Update level actions display if this is the current level
        await updateLevelActionsDisplay();
        
        console.log(`Settings saved for ${currentEditingLevel} (direction: ${currentDirection})`);
    } else {
        const error = globalResult.error || directionResult.error;
        alert(`Error saving settings: ${error}`);
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

// Helper function to update the level actions display with given settings
function updateLevelActionsDisplayWithSettings(settings) {
    const actionsDisplay = document.getElementById('levelActionsDisplay');
    
    // Always show the display
    actionsDisplay.style.display = 'block';
    
    // Update optimized status display
    const optimizedStatusEl = document.getElementById('levelOptimizedStatus');
    if (optimizedStatusEl) {
        const isOptimized = settings.optimized !== undefined ? settings.optimized : (settings.scrollDirection === 'up');
        optimizedStatusEl.textContent = isOptimized ? '(optimized)' : '(not optimized)';
        optimizedStatusEl.style.color = isOptimized ? '#4fc3f7' : '#ff9800';
    }
    
    // Only reset checkboxes if this is a new level (not just updating settings for same level)
    // This prevents clearing checkmarks when updating effective direction
    const shouldResetCheckboxes = !settings._isDirectionUpdate;
    if (shouldResetCheckboxes) {
    ['actionStartup', 'actionFirstBuild', 'actionAfterFirstBuild', 'actionSecondBuild', 'actionAfterSecondBuild'].forEach(id => {
        const element = document.getElementById(id);
        const checkbox = element.querySelector('.action-checkbox');
        checkbox.textContent = '☐';
        checkbox.classList.remove('checked');
    });
    }
    
    // Update Startup value
    let startupText;
    if (typeof settings.perfectStartingPosition === 'object') {
        const action = settings.perfectStartingPosition.action;
        if (action === 'nothing') {
            startupText = 'None';
        } else if (action === 'wait') {
            const waitTime = settings.perfectStartingPosition.waitTimeMs || 1000;
            startupText = `Wait ${waitTime}ms`;
        } else {
            startupText = action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
    } else {
        // Backward compatibility
        startupText = settings.perfectStartingPosition === 'nothing' ? 'None' : 
        settings.perfectStartingPosition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    document.getElementById('startupValue').textContent = startupText;
    
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
    const afterFirstText = settings.scrollAfterFirstBuild 
        ? (settings.scrollAfterFirstBuild.action === 'scrollCustom' 
            ? `Scroll ${settings.scrollAfterFirstBuild.direction} ${settings.scrollAfterFirstBuild.distance}px`
            : settings.scrollAfterFirstBuild.action.replace('scrollTo', 'Scroll to '))
        : (settings.scrollToBottomAfterFirstBuild ? 'Scroll to Bottom' : 'None');
    document.getElementById('afterFirstBuildValue').textContent = afterFirstText;
    
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
    const afterSecondText = settings.scrollAfterSecondBuild 
        ? (settings.scrollAfterSecondBuild.action === 'scrollCustom' 
            ? `Scroll ${settings.scrollAfterSecondBuild.direction} ${settings.scrollAfterSecondBuild.distance}px`
            : settings.scrollAfterSecondBuild.action.replace('scrollTo', 'Scroll to '))
        : (settings.scrollToBottomAfterSecondBuild ? 'Scroll to Bottom' : 'None');
    document.getElementById('afterSecondBuildValue').textContent = afterSecondText;
    
    // Update other settings
    document.getElementById('researchValue').textContent = settings.doResearch ? 'Yes' : 'No';
    document.getElementById('holdDurationValue').textContent = `${settings.blueBoxClickHoldDuration / 1000}s`;
    // Note: Don't update scrollDirValue here - it's set by effective-direction event to preserve "Random" prefix
    
    console.log('✨ Level actions display updated and visible');
}

// Main function to load settings and update display
async function updateLevelActionsDisplay() {
    console.log('DEBUG: updateLevelActionsDisplay called');
    const currentLevel = await ipcRenderer.invoke('get-current-level-name');
    
    // If no level, show default settings
    let settings;
    if (!currentLevel || currentLevel === 'Unknown Level' || currentLevel === '') {
        // Default settings when no level is known (matching settingsManager defaults)
        settings = {
            perfectStartingPosition: 'nothing',
            firstBuildAction: { action: 'nothing', triggerTimeMs: 0, clickaroundOptions: {}, clickOffAndScrollDirection: 'down' },
            secondBuildAction: { action: 'nothing', triggerTimeMs: 0, clickaroundOptions: {}, clickOffAndScrollDirection: 'down' },
            scrollAfterFirstBuild: { action: 'scrollToBottom', direction: 'down', distance: 300 },  // Default is scroll to bottom for unnamed levels
            scrollAfterSecondBuild: { action: 'nothing', direction: 'down', distance: 300 },
            doResearch: true,  // Default is true
            blueBoxClickHoldDuration: 4500,  // Default is 4.5s
            scrollDirection: 'up'
        };
    } else {
        settings = await ipcRenderer.invoke('get-level-settings', currentLevel.toLowerCase());
    }
    
    updateLevelActionsDisplayWithSettings(settings);
    
    // Set scroll direction label (will be overridden by effective-direction event if random mode applies)
    document.getElementById('scrollDirValue').textContent = settings.scrollDirection === 'up' ? 'Up ↑' : 'Down ↓';
    
    // Update custom triggers display
    await updateCustomTriggersDisplay();
}

// Custom Triggers Management - Integrated into Level Progress
async function updateCustomTriggersDisplay(direction = null) {
    const currentLevel = await ipcRenderer.invoke('get-current-level-name');
    const customTriggersIntegrated = document.getElementById('customTriggersIntegrated');
    const customTriggersValue = document.getElementById('customTriggersValue');
    const triggersListIntegrated = document.getElementById('triggersListIntegrated');
    
    // Check if we have a valid level
    const hasValidLevel = currentLevel && currentLevel !== 'Unknown Level' && currentLevel !== '';
    
    if (!hasValidLevel) {
        customTriggersIntegrated.style.display = 'none';
        return;
    }
    
    try {
        // If no direction specified, get it from settings (will default to saved direction)
        const triggers = await ipcRenderer.invoke('get-custom-triggers', currentLevel.toLowerCase(), direction);
        
        if (triggers && triggers.length > 0) {
            customTriggersIntegrated.style.display = 'block';
            customTriggersValue.textContent = `${triggers.length} configured`;
            
            // Clear and populate triggers list
            triggersListIntegrated.innerHTML = '';
            triggers.forEach((trigger, index) => {
                addTriggerItemIntegrated(trigger, index);
            });
        } else {
            customTriggersIntegrated.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error loading custom triggers:', error);
        customTriggersIntegrated.style.display = 'none';
    }
}

function addTriggerItemIntegrated(trigger, index) {
    const triggersListIntegrated = document.getElementById('triggersListIntegrated');
    
    const triggerDiv = document.createElement('div');
    triggerDiv.className = 'trigger-item-integrated';
    
    // Show timing (DURING or AFTER), not trigger type
    const timingLabel = trigger.timing === 'after' ? 'AFTER' : 'DURING';
    const actionLabel = trigger.action.charAt(0).toUpperCase() + trigger.action.slice(1).replace(/([A-Z])/g, ' $1');
    
    // Determine what to show for params
    let paramsLabel = '';
    const timing = trigger.timing || 'during';
    
    if (timing === 'during') {
        // DURING build - show time for most actions
        if (trigger.action === 'scrollUp' || trigger.action === 'scrollDown') {
            paramsLabel = `${trigger.actionParams || 0}ms, ${trigger.actionDistance || 200}px`;
        } else if (trigger.action === 'scrollToTop' || trigger.action === 'scrollToBottom') {
            paramsLabel = `${trigger.actionParams || 0}ms`;
        } else if (trigger.action === 'clickAround') {
            paramsLabel = `${trigger.actionParams || 0}ms`;
        }
    } else {
        // AFTER build - only show distance for scroll up/down
        if (trigger.action === 'scrollUp' || trigger.action === 'scrollDown') {
            paramsLabel = `${trigger.actionDistance || 200}px`;
        }
        // For scrollToTop, scrollToBottom, clickAround - show nothing
    }
    
    triggerDiv.innerHTML = `
        <span class="trigger-type">${timingLabel}</span>
        <span class="trigger-value">${trigger.triggerValue}</span>
        <span class="trigger-action">${actionLabel}</span>
        ${paramsLabel ? `<span class="trigger-params">${paramsLabel}</span>` : ''}
    `;
    
    triggersListIntegrated.appendChild(triggerDiv);
}


// Listen for level name changes to update actions display
ipcRenderer.on('update-current-level-name', async () => {
    await updateLevelActionsDisplay();
});

// Show effective direction in Level Progress when random applies
ipcRenderer.on('effective-direction', async (event, mode, dir, randomApplied) => {
    try {
        let label;
        if (mode === 'random' && randomApplied) {
            label = `Random ${dir === 'up' ? 'Up ↑' : 'Down ↓'}`;
        } else if (mode === 'best') {
            label = `Best ${dir === 'up' ? 'Up ↑' : 'Down ↓'}`;
        } else if (mode === 'worst') {
            label = `Worst ${dir === 'up' ? 'Up ↑' : 'Down ↓'}`;
        } else {
            label = dir === 'up' ? 'Up ↑' : 'Down ↓';
        }
        const el = document.getElementById('scrollDirValue');
        if (el) el.textContent = label;
        
        // Also update the entire level actions display with the effective direction's settings
        const currentLevel = await ipcRenderer.invoke('get-current-level-name');
        if (currentLevel && currentLevel !== 'Unknown Level' && currentLevel !== '') {
            // Get both global and direction-specific settings
            const globalSettings = await ipcRenderer.invoke('get-level-settings', currentLevel.toLowerCase());
            const directionSettings = await ipcRenderer.invoke('get-direction-settings', currentLevel.toLowerCase(), dir);
            // Merge: direction-specific settings override, but keep global settings like doResearch, blueBoxClickHoldDuration
            const effectiveSettings = {
                ...directionSettings,
                doResearch: globalSettings.doResearch,
                blueBoxClickHoldDuration: globalSettings.blueBoxClickHoldDuration,
                scrollDirection: dir,
                _isDirectionUpdate: true  // Mark as direction update to prevent clearing checkmarks
            };
            await updateLevelActionsDisplayWithSettings(effectiveSettings);
            
            // Update custom triggers display for the effective direction
            await updateCustomTriggersDisplay(dir);
        }
    } catch (e) {
        console.error('Error updating effective direction:', e);
    }
});

// Test event handler to verify IPC is working
ipcRenderer.on('test-event', (event, data) => {
    console.log(`🧪 RENDERER: Received test event: ${data}`);
});

// Listen for action completion events to update checkmarks
ipcRenderer.on('level-action-completed', (event, actionType) => {
    console.log(`🔔 RENDERER: Received level-action-completed event: ${actionType}`);
    console.log(`🔔 RENDERER: Event object:`, event);
    console.log(`🔔 RENDERER: Action type:`, actionType);
    
    const actionMap = {
        'startup': 'actionStartup',
        'first_build': 'actionFirstBuild',
        'after_first_build': 'actionAfterFirstBuild',
        'second_build': 'actionSecondBuild',
        'after_second_build': 'actionAfterSecondBuild'
    };
    
    const elementId = actionMap[actionType];
    console.log(`📍 RENDERER: Mapped to element ID: ${elementId}`);
    
    if (elementId) {
        const element = document.getElementById(elementId);
        console.log(`🎯 RENDERER: Found element:`, element);
        
        if (element) {
            const checkbox = element.querySelector('.action-checkbox');
            console.log(`✅ RENDERER: Found checkbox:`, checkbox);
            
            if (checkbox) {
                checkbox.textContent = '☑';
                checkbox.classList.add('checked');
                console.log(`✨ RENDERER: Checkbox updated for ${actionType}!`);
            } else {
                console.log(`❌ RENDERER: No checkbox found in element for ${actionType}`);
            }
        } else {
            console.log(`❌ RENDERER: Element not found: ${elementId}`);
        }
    } else {
        console.log(`❌ RENDERER: No mapping found for action: ${actionType}`);
    }
});
