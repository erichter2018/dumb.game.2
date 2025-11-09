/**
 * Scroll Tracker - Wraps scroll functions to detect actual movement for mapping
 */

/**
 * Match blobs between before/after to calculate actual scroll movement
 * @param {Array} beforeBlobs - Blobs before scroll
 * @param {Array} afterBlobs - Blobs after scroll
 * @param {number} expectedDistance - Expected scroll distance
 * @param {string} direction - 'down' or 'up'
 * @returns {number} Actual movement detected (negative for down, positive for up)
 */
function detectScrollMovement(beforeBlobs, afterBlobs, expectedDistance, direction) {
  if (!beforeBlobs || !afterBlobs || beforeBlobs.length === 0 || afterBlobs.length === 0) {
    console.log('DEBUG: [SCROLL_TRACKER] No blobs to match, cannot detect movement');
    return 0;
  }

  const matches = [];
  const usedAfterBlobs = new Set();

  // Match blobs by X similarity and expected Y displacement
  for (const beforeBlob of beforeBlobs) {
    let bestMatch = null;
    let minDisplacementError = Infinity;

    for (let i = 0; i < afterBlobs.length; i++) {
      if (usedAfterBlobs.has(i)) continue;

      const afterBlob = afterBlobs[i];
      const dx = Math.abs(afterBlob.x - beforeBlob.x);
      const actualYDisplacement = afterBlob.y - beforeBlob.y;

      // Must have similar X coordinate (within 30px)
      if (dx < 30) {
        // Expected Y: negative for down (content moves up), positive for up (content moves down)
        const expectedY = direction === 'down' ? -expectedDistance : expectedDistance;
        const displacementError = Math.abs(actualYDisplacement - expectedY);

        if (displacementError < minDisplacementError && displacementError < 150) {
          minDisplacementError = displacementError;
          bestMatch = { blob: afterBlob, index: i, actualYDisplacement };
        }
      }
    }

    if (bestMatch) {
      usedAfterBlobs.add(bestMatch.index);
      matches.push({
        before: beforeBlob,
        after: bestMatch.blob,
        displacement: bestMatch.actualYDisplacement
      });
    }
  }

  if (matches.length === 0) {
    console.log('DEBUG: [SCROLL_TRACKER] No matching blobs found, cannot detect movement');
    return 0;
  }

  // Calculate average Y displacement
  const avgDisplacement = matches.reduce((sum, m) => sum + m.displacement, 0) / matches.length;
  
  // Return absolute value (positive number)
  const actualMovement = Math.abs(avgDisplacement);
  
  console.log(`DEBUG: [SCROLL_TRACKER] Matched ${matches.length} blobs, avg displacement: ${avgDisplacement.toFixed(1)}px, actual movement: ${actualMovement.toFixed(1)}px`);
  
  return actualMovement;
}

/**
 * Perform a scroll and track its actual movement
 * @param {Function} scrollFunc - The scroll function to call
 * @param {Object} detectFunc - Function to detect blobs before/after scroll
 * @param {number} distance - Expected scroll distance
 * @param {string} direction - 'down' or 'up'
 * @returns {Promise<{success: boolean, actualMovement: number}>}
 */
async function trackScroll(scrollFunc, detectFunc, distance, direction) {
  try {
    // Detect blobs before scroll
    const beforeBlobs = await detectFunc();
    
    // Perform the scroll
    const scrollResult = await scrollFunc();
    
    if (!scrollResult.success) {
      return { success: false, actualMovement: 0 };
    }
    
    // Wait for content to settle
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Detect blobs after scroll
    const afterBlobs = await detectFunc();
    
    // Calculate actual movement
    const actualMovement = detectScrollMovement(beforeBlobs, afterBlobs, distance, direction);
    
    return {
      success: true,
      actualMovement,
      beforeBlobCount: beforeBlobs.length,
      afterBlobCount: afterBlobs.length
    };
  } catch (error) {
    console.error('ERROR: [SCROLL_TRACKER] trackScroll failed:', error);
    return { success: false, actualMovement: 0, error: error.message };
  }
}

module.exports = {
  detectScrollMovement,
  trackScroll
};

