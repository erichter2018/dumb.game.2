# ClickAround Automation Feature Design

This document details the design and implementation of the `clickAround` automation feature. The primary goal of `clickAround` is to systematically click various points on the screen within a defined region, avoiding specific exclusion zones and areas too close to detected red blobs. It is designed to be interruptible by user mouse movement and to stop under certain conditions, such as stable red blob detections or a maximum number of scrolls.

## Purpose

The `clickAround` function aims to simulate a user "exploring" a game interface by clicking in a grid-like pattern. This can be useful for triggering hidden elements, discovering new interactions, or simply keeping the interface active in a semi-randomized manner.

## Core Logic and Flow

The `clickAround` automation follows these main steps:

1.  **Initial Setup:**
    *   Imports necessary functions from `scrolling.js` (`getRandomInt`, `scrollToTop`, `scrollDown`).
    *   Defines a `redBlobProximityThreshold` (100 pixels) to avoid clicking too close to red blobs.
    *   Establishes four `exclusionZones` to prevent clicks in specific UI areas:
        *   Any Y value less than 450 (from the top of the iPhone mirroring region).
        *   Any Y value more than 800 (from the top of the iPhone mirroring region).
        *   The leftmost 25-pixel column of the mirroring region.
        *   The rightmost 25-pixel column of the mirroring region.
    *   Initializes `redBlobHistory` (to track red blob positions over time), `scrollCount`, `maxScrolls` (7 iterations), and `minCellSize`/`maxCellSize` (27-31 pixels for grid generation).

2.  **Initial Scroll Actions:**
    *   Performs a `scrollToTop` action once at the beginning to ensure the automation starts from a consistent screen position.
    *   Immediately after `scrollToTop`, it performs three `scrollDown` actions (each 50 pixels, totaling 150 pixels) to move slightly down from the very top.

3.  **Main Automation Loop (`while (scrollCount < maxScrolls)`):**
    *   **Pause Check:** At the beginning of each iteration (and before every click sequence), a `checkPauseState` helper function is called. This function actively waits if the automation is paused due to user mouse movement, and will exit if the user stops the automation while it's paused.
    *   **Red Blob Detection:** Captures a screenshot and detects all red blobs using `redBlobDetectorDetect`. These positions are used to avoid clicking too close to existing blobs.
    *   **Red Blob History and Stability Check:**
        *   The current set of detected red blob positions is added to `redBlobHistory` (keeping a maximum of 3 entries).
        *   If the red blob positions have remained identical for the last 3 detections, the automation stops, indicating a stable screen state where further clicking might be unproductive.
    *   **Grid Generation:** Random `cellSizeX` and `cellSizeY` values (between 27 and 31 pixels) are generated for the current iteration.
    *   **Clicking Logic (Iterating through the grid):**
        *   The function iterates through the iPhone mirroring region, creating a grid of potential click points.
        *   For each grid cell, a random `targetX` and `targetY` are calculated within that cell, and clamped to stay strictly within the `iphoneMirroringRegion` boundaries.
        *   **Exclusion Checks:**
            *   **Exclusion Zones:** It checks if `(targetX, targetY)` falls within any of the defined `exclusionZones`. If so, the click is skipped.
            *   **Red Blob Proximity:** It calculates the distance from `(targetX, targetY)` to every detected red blob. If the distance is less than or equal to `redBlobProximityThreshold` (100 pixels), the click is skipped.
        *   **Batched Clicks per Row:** Valid click coordinates for each row are collected into a `clicksInRow` array. Once a row is fully processed, `performBatchedClicks(clicksInRow)` is called. The `performBatchedClicks` function in `main.js` uses robotjs for direct, fast clicking without shell commands, ensuring very fast clicks in a row. A small delay (2ms) is introduced between rows with robotjs.
    *   **Scroll Down:** After a full set of grid clicks (potentially across multiple screenfuls due to previous scrolls), the screen scrolls down 7 times (each scroll 50 pixels, totaling 350 pixels) using `scrollDown`.
    *   **Iteration Count:** `scrollCount` is incremented.
    *   **Loop Termination:** The loop continues until `scrollCount` reaches `maxScrolls` (7) or red blob positions become stable for 3 consecutive detections.

## Key Code Snippets

### `src/automation/clickAround.js`

```javascript
const { getRandomInt } = require('./scrolling');
const { scrollToTop, scrollDown } = require('./scrolling');

async function clickAround(dependencies) {
  const { updateStatus, detectRedBlobs, performClick, iphoneMirroringRegion, getIsClickAroundRunning, getIsClickAroundPaused, updateCurrentFunction, CLICK_AREAS, captureScreenRegion } = dependencies;
  updateStatus('Starting Click Around automation...', 'info');

  const redBlobProximityThreshold = 100;

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
    await scrollToTop({ updateCurrentFunction: dependencies.updateCurrentFunction, performClick, CLICK_AREAS: dependencies.CLICK_AREAS });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Initial scroll down of 3 times (150 pixels total)
    updateStatus('Click Around: Initial scroll to top complete. Scrolling down by 150 pixels...', 'info');
    await scrollDown(regionX + regionWidth / 2, regionY + regionHeight / 2, 50); // Changed distance to 50px each
    await new Promise(resolve => setTimeout(resolve, 100));
    await scrollDown(regionX + regionWidth / 2, regionY + regionHeight / 2, 50);
    await new Promise(resolve => setTimeout(resolve, 100));
    await scrollDown(regionX + regionWidth / 2, regionY + regionHeight / 2, 50);
    await new Promise(resolve => setTimeout(resolve, 100));

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

      if (redBlobHistory.length === 3) {
        redBlobHistory.shift();
      }
      redBlobHistory.push(JSON.stringify(redBlobPositions.sort((a,b) => a.x - b.x || a.y - b.y)));

      if (redBlobHistory.length === 3 &&
          redBlobHistory[0] === redBlobHistory[1] &&
          redBlobHistory[1] === redBlobHistory[2]) {
        updateStatus('Click Around: Red blob positions stable for 3 detections. Stopping.', 'success');
        break;
      }

      const cellSizeX = getRandomInt(minCellSize, maxCellSize);
      const cellSizeY = getRandomInt(minCellSize, maxCellSize);

      for (let y = regionY; y < regionY + regionHeight; y += cellSizeY) {
        let clicksInRow = [];
        for (let x = regionX; x < regionX + regionWidth; x += cellSizeX) {
          let targetX = x + getRandomInt(0, cellSizeX - 1);
          let targetY = y + getRandomInt(0, cellSizeY - 1);

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
          await performClick(clicksInRow);
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (!await checkPauseState()) return;
      }

      // Scroll down 7 times (50 pixels each, total 350 pixels)
      updateStatus('Click Around: Scrolling down by 350 pixels.', 'info');
      for (let i = 0; i < 7; i++) {
        await scrollDown(regionX + regionWidth / 2, regionY + regionHeight / 2, 50);
        await new Promise(resolve => setTimeout(resolve, 100));
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
```
