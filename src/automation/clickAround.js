const { getRandomInt } = require('./scrolling');
const { scrollToTop, scrollDown, scrollUpWithDistance } = require('./scrolling');

// Helper function to generate all valid click positions for a screen (calculated once per screen)
function generateValidClickPositions(regionX, regionY, regionWidth, regionHeight, exclusionZones, cellSizeX, cellSizeY) {
  const validClicks = [];
  
  for (let y = regionY; y < regionY + regionHeight; y += cellSizeY) {
    for (let x = regionX; x < regionX + regionWidth; x += cellSizeX) {
      let targetX = x + getRandomInt(0, cellSizeX - 1);
      let targetY = y + getRandomInt(0, cellSizeY - 1) + 7; // Increased Y offset by 7 pixels
      
      targetX = Math.min(Math.max(targetX, regionX), regionX + regionWidth - 1);
      targetY = Math.min(Math.max(targetY, regionY), regionY + regionHeight - 1);
      
      // Check exclusion zones ONCE per position
      const inExclusionZone = exclusionZones.some(zone =>
        targetX >= zone.x1 && targetX <= zone.x2 &&
        targetY >= zone.y1 && targetY <= zone.y2
      );
      
      if (!inExclusionZone) {
        validClicks.push({ x: targetX, y: targetY });
      }
    }
  }
  
  return validClicks;
}

// Helper function to filter out clicks too close to red blobs (calculated once per screen)
function filterRedBlobConflicts(validClicks, redBlobPositions, threshold, exclude_red_blobs) {
  if (!exclude_red_blobs || !redBlobPositions || redBlobPositions.length === 0) {
    return validClicks;
  }
  
  return validClicks.filter(click => {
    return !redBlobPositions.some(blob => {
      const distance = Math.sqrt(Math.pow(click.x - blob.x, 2) + Math.pow(click.y - blob.y, 2));
      return distance <= threshold;
    });
  });
}

async function clickAround(dependencies, exclude_red_blobs = true, options = {}) {
  // Default options for clickAround behavior
  const defaultOptions = {
    excludeRedBlobs: true,             // Avoid red blobs by default
    clickaroundChunks: 3,              // Number of click chunks (screens) to process
    scrollUpDistance: 200,             // Scroll up distance in pixels per iteration
    scrollUpCount: 5,                  // How many times to scroll up by scrollUpDistance
    initialScrollDown: 150,            // Initial scroll down distance in pixels AFTER scroll up
    scrollToBottomAtEnd: true          // Scroll to bottom when finished
  };
  
  // Merge provided options with defaults
  const config = { ...defaultOptions, ...options };
  
  // Note: exclude_red_blobs parameter maintained for backward compatibility, but overridden by config
  const shouldExcludeRedBlobs = config.excludeRedBlobs;
  
  const { updateStatus, detectRedBlobs, performClick, performBatchedClicks, iphoneMirroringRegion, getIsClickAroundRunning, getIsClickAroundPaused, updateCurrentFunction, CLICK_AREAS, captureScreenRegion, compareBottomRegions, captureBottomRegion, scrollToBottom, scrollSwipeDistance, scrollToBottomIterations } = dependencies;
  
  updateStatus(`Starting Click Around automation... (chunks: ${config.clickaroundChunks}, excludeRedBlobs: ${shouldExcludeRedBlobs}, scrollDistance: ${config.scrollUpDistance}px, initialScrollDown: ${config.initialScrollDown}px, scrollToBottomAtEnd: ${config.scrollToBottomAtEnd})`, 'info');
  console.log(`DEBUG: ClickAround started with config:`, config);

  const redBlobProximityThreshold = 250;

  const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = iphoneMirroringRegion;

  const exclusionZones = [
    // Any Y value less than 450 (absolute screen Y)
    { x1: regionX, y1: regionY, x2: regionX + regionWidth, y2: Math.min(regionY + regionHeight, 449) },
    // Any Y value more than 800 (absolute screen Y)
    { x1: regionX, y1: Math.max(regionY, 801), x2: regionX + regionWidth, y2: regionY + regionHeight },
    // Left and right 25-pixel columns (absolute screen X, full Y range of region)
    { x1: regionX, y1: regionY, x2: regionX + 25, y2: regionY + regionHeight }, // Leftmost 25 pixels
    { x1: regionX + regionWidth - 25, y1: regionY, x2: regionX + regionWidth, y2: regionY + regionHeight }, // Rightmost 25 pixels
  ];

  let redBlobHistory = [];
  let scrollCount = 0;
  const maxScrolls = config.clickaroundChunks; // Use configured chunk count (number of screens to process)
  const minCellSize = 27; // Minimum grid cell size (pixels)
  const maxCellSize = 31; // Maximum grid cell size (pixels)
  let previousBottomImage = null; // Store previous bottom image for comparison

  try {
    // 0. Click off first to ensure clean state
    if (CLICK_AREAS && CLICK_AREAS.CLICK_OFF) {
      updateStatus('Click Around: Clicking off to start...', 'info');
      await performClick(CLICK_AREAS.CLICK_OFF.x, CLICK_AREAS.CLICK_OFF.y);
      console.log('DEBUG: ClickAround - Initial click off performed at:', CLICK_AREAS.CLICK_OFF.x, CLICK_AREAS.CLICK_OFF.y);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 1. Scroll up by scrollUpDistance × scrollUpCount times (if configured)
    if (config.scrollUpDistance > 0 && config.scrollUpCount > 0) {
      updateStatus(`Click Around: Scrolling up ${config.scrollUpCount} times by ${config.scrollUpDistance} pixels each...`, 'info');
      console.log(`DEBUG: ClickAround scrolling up ${config.scrollUpCount} times by ${config.scrollUpDistance}px each`);
      for (let i = 0; i < config.scrollUpCount; i++) {
        await scrollUpWithDistance(regionX + regionWidth / 2, regionY + regionHeight / 2, config.scrollUpDistance);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      console.log(`DEBUG: ClickAround completed ${config.scrollUpCount} scroll-up iterations`);
    }

    // 2. Initial scroll down (configurable distance)
    if (config.initialScrollDown > 0) {
      updateStatus(`Click Around: Scrolling down by ${config.initialScrollDown} pixels...`, 'info');
      await scrollDown(regionX + regionWidth / 2, regionY + regionHeight / 2, config.initialScrollDown);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const checkPauseState = async () => {
      while (getIsClickAroundPaused() && getIsClickAroundRunning()) {
        updateStatus('Click Around: Paused due to mouse movement...', 'warning');
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!getIsClickAroundRunning()) {
          updateStatus('Click Around: Stopped by user.', 'info');
          return false;
        }
      }
      return getIsClickAroundRunning();
    };

    if (!await checkPauseState()) return;

    while (scrollCount < maxScrolls) {
      if (!await checkPauseState()) break;

      updateStatus(`Click Around: Scroll iteration ${scrollCount + 1}/${maxScrolls}`, 'info');

      // Smart bottom detection using image comparison
      if (previousBottomImage) {
        // We have a previous image to compare against
        console.log(`DEBUG: ClickAround comparing current screen to previous image to detect if we've reached the bottom.`);
        try {
          const currentBottomImage = await captureBottomRegion(captureScreenRegion, iphoneMirroringRegion);
          const comparison = await compareBottomRegions(previousBottomImage, currentBottomImage, iphoneMirroringRegion, 50, 0.05);
          
          if (comparison.isAtBottom) {
            console.log(`DEBUG: ClickAround image comparison indicates we've reached the bottom (difference: ${(comparison.difference * 100).toFixed(1)}%). Stopping click around.`);
            const similarityPercent = (100 - (comparison.difference * 100)).toFixed(1);
            updateStatus(`Reached bottom of content (${similarityPercent}% match). Click Around complete.`, 'success');
            console.log(`🟡 IMAGE MATCH: ${similarityPercent}% similarity detected during scroll down`);
            break; // Exit the loop - we've reached the bottom
          } else {
            console.log(`DEBUG: ClickAround image comparison shows significant change (difference: ${(comparison.difference * 100).toFixed(1)}%). Continuing to scroll down.`);
            const similarityPercent = (100 - (comparison.difference * 100)).toFixed(1);
            console.log(`🟡 IMAGE MATCH: ${similarityPercent}% similarity - continuing scroll down`);
          }
        } catch (error) {
          console.error(`DEBUG: ClickAround image comparison failed: ${error.message}. Continuing with normal flow.`);
        }
      }

      // DOUBLE red blob detection per screen to catch blobs that might be missed in one pass
      console.log(`DEBUG: ClickAround - Performing first red blob detection pass...`);
      const fullScreenDataUrl1 = await captureScreenRegion();
      const redBlobsRaw1 = await detectRedBlobs(fullScreenDataUrl1, iphoneMirroringRegion);
      
      // Small delay between detections
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log(`DEBUG: ClickAround - Performing second red blob detection pass...`);
      const fullScreenDataUrl2 = await captureScreenRegion();
      const redBlobsRaw2 = await detectRedBlobs(fullScreenDataUrl2, iphoneMirroringRegion);
      
      // Merge blobs from both passes, removing duplicates
      // Two blobs are considered the same if they're within 30px of each other
      const mergedBlobsRaw = [...redBlobsRaw1];
      for (const blob2 of redBlobsRaw2) {
        const isDuplicate = mergedBlobsRaw.some(blob1 => {
          const distance = Math.sqrt(Math.pow(blob1.x - blob2.x, 2) + Math.pow(blob1.y - blob2.y, 2));
          return distance < 30;
        });
        if (!isDuplicate) {
          mergedBlobsRaw.push(blob2);
        }
      }
      
      // Filter out special named blobs (research blob, exit level) from clickAround detection
      const currentRedBlobs = mergedBlobsRaw.filter(blob => !blob.name);
      console.log(`DEBUG: ClickAround detection - Pass 1: ${redBlobsRaw1.length} blobs, Pass 2: ${redBlobsRaw2.length} blobs, Merged: ${mergedBlobsRaw.length} blobs, After filtering named: ${currentRedBlobs.length}`);
      
      // Send red blob detections for overlay display
      if (currentRedBlobs && currentRedBlobs.length > 0) {
        console.log(`🟡 CLICKAROUND RED BLOBS: Found ${currentRedBlobs.length} red blobs for overlay display`);
        // Send detection results for overlay display
        if (dependencies.sendDetectionResults) {
          dependencies.sendDetectionResults({ redBlobs: currentRedBlobs, blueBoxes: [] });
        }
      }
      
      // Extract positions for exclusion filtering
      const redBlobPositions = currentRedBlobs.map(blob => ({ x: blob.x, y: blob.y }));
      if (shouldExcludeRedBlobs) {
        console.log(`DEBUG: ClickAround will exclude ${redBlobPositions.length} red blobs from clicking:`, redBlobPositions);
      } else {
        console.log(`DEBUG: ClickAround detected ${redBlobPositions.length} red blobs but will NOT exclude them from clicking:`, redBlobPositions);
      }

      if (redBlobHistory.length === 2) {
        redBlobHistory.shift();
      }
      redBlobHistory.push(JSON.stringify(redBlobPositions.sort((a,b) => a.x - b.x || a.y - b.y)));

      // Only check for stability after at least 4 full cycles have completed
      if (scrollCount >= 4 && redBlobHistory.length >= 2 &&
          redBlobHistory[redBlobHistory.length - 1] === redBlobHistory[redBlobHistory.length - 2]) {
        updateStatus('Click Around: Red blob positions stable for 2 detections (after 4+ cycles). Stopping.', 'success');
        break;
      }

      const cellSizeX = getRandomInt(minCellSize, maxCellSize);
      const cellSizeY = getRandomInt(minCellSize, maxCellSize);

      console.log(`DEBUG: Generating click grid with cell size ${cellSizeX}x${cellSizeY} for screen ${scrollCount + 1}`);
      
      // OPTIMIZED: Generate all valid clicks for this screen once
      const validClicks = generateValidClickPositions(regionX, regionY, regionWidth, regionHeight, exclusionZones, cellSizeX, cellSizeY);
      console.log(`DEBUG: Generated ${validClicks.length} valid click positions (after exclusion zones)`);
      
      // OPTIMIZED: Filter red blob conflicts once per screen
      const finalClicks = filterRedBlobConflicts(validClicks, redBlobPositions, redBlobProximityThreshold, shouldExcludeRedBlobs);
      console.log(`DEBUG: Final click count after red blob filtering: ${finalClicks.length} (filtered out ${validClicks.length - finalClicks.length})`);
      
      // OPTIMIZED: Single batch click for entire screen - MUCH faster!
      if (finalClicks.length > 0) {
        console.log(`DEBUG: Performing ${finalClicks.length} clicks for entire screen in single optimized batch`);
        await performBatchedClicks(finalClicks);
        console.log(`DEBUG: Completed ${finalClicks.length} clicks in single batch - no row delays needed`);
      } else {
        console.log(`DEBUG: No clicks to perform for this screen (all excluded)`);
      }
      
      // Check pause state once per screen instead of every 5 rows
      if (!await checkPauseState()) return;

      scrollCount++;
      
      // Only scroll down if there are more chunks to process
      if (scrollCount < maxScrolls) {
        // Scroll down (350 pixels hardcoded between chunks)
        const scrollDownBetweenChunks = 350;
        updateStatus(`Click Around: Completed screen ${scrollCount}/${maxScrolls}. Scrolling down by ${scrollDownBetweenChunks} pixels to next chunk.`, 'info');
        await scrollDown(regionX + regionWidth / 2, regionY + regionHeight / 2, scrollDownBetweenChunks);
        
        // Capture bottom image for next iteration's comparison
        try {
          previousBottomImage = await captureBottomRegion(captureScreenRegion, iphoneMirroringRegion);
          console.log(`DEBUG: ClickAround captured bottom image for next iteration comparison.`);
        } catch (error) {
          console.error(`DEBUG: ClickAround failed to capture bottom image: ${error.message}`);
        }
      } else {
        updateStatus(`Click Around: Completed final screen ${scrollCount}/${maxScrolls}. No more chunks to process.`, 'info');
        console.log(`DEBUG: ClickAround completed final chunk - no scroll down needed`);
      }
    }

    if (scrollCount >= maxScrolls) {
      updateStatus('Click Around: Max scroll attempts reached. Stopping.', 'info');
    }
    
    // Scroll to bottom at the end if configured
    if (config.scrollToBottomAtEnd && scrollToBottom) {
      updateStatus('Click Around: Scrolling to bottom...', 'info');
      console.log('DEBUG: ClickAround scrolling to bottom at end');
      const scrollX = regionX + regionWidth / 2;
      const scrollY = regionY + regionHeight / 2;
      await scrollToBottom(scrollX, scrollY, scrollSwipeDistance || 200, scrollToBottomIterations || 10, { 
        updateCurrentFunction, 
        performClick, 
        CLICK_AREAS 
      });
    }

  } catch (error) {
    console.error('Error during Click Around automation:', error);
    updateStatus(`Click Around: Error - ${error.message}`, 'error');
    return { success: false, error: error.message };
  }

  updateStatus('Click Around automation finished.', 'success');
  return { success: true };
}

module.exports = {
  clickAround,
};