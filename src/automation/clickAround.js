const { getRandomInt } = require('./scrolling');
const { scrollToTop, scrollDown } = require('./scrolling');

async function clickAround(dependencies) {
  const { updateStatus, detectRedBlobs, performClick, performBatchedClicks, iphoneMirroringRegion, getIsClickAroundRunning, getIsClickAroundPaused, updateCurrentFunction, CLICK_AREAS, captureScreenRegion } = dependencies;
  updateStatus('Starting Click Around automation...', 'info');

  const redBlobProximityThreshold = 150;

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
  const maxScrolls = 7; // Maximum 7 full iterations (sets of clicks and scrolls)
  const minCellSize = 27; // Minimum grid cell size (pixels)
  const maxCellSize = 31; // Maximum grid cell size (pixels)

  try {
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

      const fullScreenDataUrl = await captureScreenRegion();
      const currentRedBlobs = await detectRedBlobs(fullScreenDataUrl, iphoneMirroringRegion);
      const redBlobPositions = currentRedBlobs.map(blob => ({ x: blob.x, y: blob.y }));

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

          const tooCloseToRedBlob = redBlobPositions.some(blob => {
            const distance = Math.sqrt(Math.pow(targetX - blob.x, 2) + Math.pow(targetY - blob.y, 2));
            return distance <= redBlobProximityThreshold;
          });

          if (tooCloseToRedBlob) {
            continue;
          }

          clicksInRow.push({ x: targetX, y: targetY });
        }

        if (clicksInRow.length > 0) {
          // Use robotjs-based batched clicking for much faster execution
          await performBatchedClicks(clicksInRow);
          await new Promise(resolve => setTimeout(resolve, 2)); // Minimal delay between rows with robotjs
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