const { getRandomInt } = require('./scrolling');
const { scrollToTop, scrollDown } = require('./scrolling');

async function clickAround(dependencies, exclude_red_blobs = true) {
  const { updateStatus, detectRedBlobs, performClick, performBatchedClicks, iphoneMirroringRegion, getIsClickAroundRunning, getIsClickAroundPaused, updateCurrentFunction, CLICK_AREAS, captureScreenRegion, compareBottomRegions, captureBottomRegion } = dependencies;
  updateStatus(`Starting Click Around automation... (exclude_red_blobs: ${exclude_red_blobs})`, 'info');
  console.log(`DEBUG: ClickAround started with exclude_red_blobs: ${exclude_red_blobs}`);

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
  const maxScrolls = 7; // Fallback maximum scroll attempts (safety limit)
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

    // 1. Scroll to top once at the beginning
    updateStatus('Click Around: Scrolling to top...', 'info');
    await scrollToTop({ 
      updateCurrentFunction: dependencies.updateCurrentFunction, 
      performClick, 
      CLICK_AREAS: dependencies.CLICK_AREAS,
      iphoneMirroringRegion: iphoneMirroringRegion 
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Initial scroll down (150 pixels total in single call)
    updateStatus('Click Around: Initial scroll to top complete. Scrolling down by 150 pixels...', 'info');
    await scrollDown(regionX + regionWidth / 2, regionY + regionHeight / 2, 150); // Single call with total distance

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

      // First red blob detection
      const fullScreenDataUrl = await captureScreenRegion();
      const currentRedBlobsRaw = await detectRedBlobs(fullScreenDataUrl, iphoneMirroringRegion);
      
      // Filter out special named blobs (research blob, exit level) from clickAround detection
      const currentRedBlobs = currentRedBlobsRaw.filter(blob => !blob.name);
      console.log(`DEBUG: ClickAround first detection found ${currentRedBlobsRaw.length} red blobs, ${currentRedBlobs.length} after filtering out named blobs`);
      
      // Send red blob detections for overlay display
      if (currentRedBlobs && currentRedBlobs.length > 0) {
        console.log(`🟡 CLICKAROUND RED BLOBS: Found ${currentRedBlobs.length} red blobs for overlay display`);
        // Send detection results for overlay display
        if (dependencies.sendDetectionResults) {
          dependencies.sendDetectionResults({ redBlobs: currentRedBlobs, blueBoxes: [] });
        }
      }
      
      // Second red blob detection to catch any missed/wiggling blobs
      const fullScreenDataUrlSecond = await captureScreenRegion();
      const currentRedBlobsSecondRaw = await detectRedBlobs(fullScreenDataUrlSecond, iphoneMirroringRegion);
      
      // Filter out special named blobs (research blob, exit level) from clickAround detection
      const currentRedBlobsSecond = currentRedBlobsSecondRaw.filter(blob => !blob.name);
      console.log(`DEBUG: ClickAround second detection found ${currentRedBlobsSecondRaw.length} red blobs, ${currentRedBlobsSecond.length} after filtering out named blobs`);
      
      // Send second red blob detections for overlay display
      if (currentRedBlobsSecond && currentRedBlobsSecond.length > 0) {
        console.log(`🟡 CLICKAROUND RED BLOBS (SECOND): Found ${currentRedBlobsSecond.length} red blobs for overlay display`);
        // Send detection results for overlay display
        if (dependencies.sendDetectionResults) {
          dependencies.sendDetectionResults({ redBlobs: currentRedBlobsSecond, blueBoxes: [] });
        }
      }
      
      // Combine both sets of results - use a Map to avoid duplicates based on coordinates
      const combinedBlobsMap = new Map();
      
      // Add first detection results
      currentRedBlobs.forEach(blob => {
        const key = `${blob.x},${blob.y}`;
        combinedBlobsMap.set(key, blob);
      });
      
      // Add second detection results (will overwrite if same coordinates, or add if new)
      currentRedBlobsSecond.forEach(blob => {
        const key = `${blob.x},${blob.y}`;
        combinedBlobsMap.set(key, blob);
      });
      
      // Convert back to array and extract positions
      const combinedRedBlobs = Array.from(combinedBlobsMap.values());
      const redBlobPositions = combinedRedBlobs.map(blob => ({ x: blob.x, y: blob.y }));
      if (exclude_red_blobs) {
        console.log(`DEBUG: ClickAround combined ${redBlobPositions.length} unique red blobs for exclusion:`, redBlobPositions);
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

      let rowCount = 0; // Track row count for optimized pause checking
      for (let y = regionY; y < regionY + regionHeight; y += cellSizeY) {
        let clicksInRow = [];
        for (let x = regionX; x < regionX + regionWidth; x += cellSizeX) {
          let targetX = x + getRandomInt(0, cellSizeX - 1);
          let targetY = y + getRandomInt(0, cellSizeY - 1) + 7; // Increased Y offset by 7 pixels

          targetX = Math.min(Math.max(targetX, regionX), regionX + regionWidth - 1);
          targetY = Math.min(Math.max(targetY, regionY), regionY + regionHeight - 1);

          const inExclusionZone = exclusionZones.some(zone =>
            targetX >= zone.x1 && targetX <= zone.x2 &&
            targetY >= zone.y1 && targetY <= zone.y2
          );

          if (inExclusionZone) {
            continue;
          }

          const tooCloseToRedBlob = exclude_red_blobs && redBlobPositions.some(blob => {
            const distance = Math.sqrt(Math.pow(targetX - blob.x, 2) + Math.pow(targetY - blob.y, 2));
            const isClose = distance <= redBlobProximityThreshold;
            if (isClose) {
              console.log(`DEBUG: Skipping click at (${targetX}, ${targetY}) - too close to red blob at (${blob.x}, ${blob.y}), distance: ${distance.toFixed(1)}px (threshold: ${redBlobProximityThreshold}px)`);
            }
            return isClose;
          });

          if (tooCloseToRedBlob) {
            continue;
          }

          clicksInRow.push({ x: targetX, y: targetY });
        }

        if (clicksInRow.length > 0) {
          console.log(`DEBUG: Row ${rowCount}: Performing ${clicksInRow.length} clicks (after exclusions)`);
          // Use robotjs-based batched clicking for much faster execution
          await performBatchedClicks(clicksInRow);
          await new Promise(resolve => setTimeout(resolve, 2)); // Minimal delay between rows with robotjs
        } else {
          console.log(`DEBUG: Row ${rowCount}: No clicks to perform (all excluded)`);
        }

        rowCount++;
        // Check pause state less frequently for better performance (every 5 rows)
        if (rowCount % 5 === 0) {
          if (!await checkPauseState()) return;
        }
      }

      // Scroll down (350 pixels total in single call)
      updateStatus('Click Around: Scrolling down by 350 pixels.', 'info');
      await scrollDown(regionX + regionWidth / 2, regionY + regionHeight / 2, 350); // Single call with total distance
      
      // Capture bottom image for next iteration's comparison
      try {
        previousBottomImage = await captureBottomRegion(captureScreenRegion, iphoneMirroringRegion);
        console.log(`DEBUG: ClickAround captured bottom image for next iteration comparison.`);
      } catch (error) {
        console.error(`DEBUG: ClickAround failed to capture bottom image: ${error.message}`);
      }
      
      scrollCount++;
    }

    if (scrollCount >= maxScrolls) {
      updateStatus('Click Around: Max scroll attempts reached. Stopping.', 'info');
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