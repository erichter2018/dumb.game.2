/**
 * Level Mapper - Creates and maintains maps of red blob positions for each level
 * Tracks scroll distances and converts screen coordinates to absolute level coordinates
 */

class LevelMapper {
  constructor() {
    this.maps = new Map(); // Maps by "levelName" only (shared between directions)
    this.currentMapKey = null;
    this.currentDirection = null; // Track current direction for this run
    this.isTracking = false;
  }

  /**
   * Start tracking a new level
   * @param {string} levelName - Name of the level
   * @param {string} direction - 'up' or 'down'
   * 
   * IMPORTANT: Every level ALWAYS starts at the same scroll position (scrollPosition = 0)
   * This means the first builds we see are always at the same absolute positions.
   * This invariant is critical for reliable mapping.
   * 
   * NOTE: Maps are shared between UP and DOWN directions - they're just different
   * approaches to complete the same level with the same build layout.
   */
  startLevel(levelName, direction) {
    const mapKey = levelName; // No direction suffix - maps are shared
    this.currentMapKey = mapKey;
    this.currentDirection = direction;
    this.isTracking = true;

    if (!this.maps.has(mapKey)) {
      // First run - create new map
      this.maps.set(mapKey, {
        levelName,
        scrollPosition: 0, // ALWAYS starts at 0 - every level begins at the same position
        blobs: [],
        scrollHistory: [],
        startTime: Date.now(),
        buildCount: 0,
        lastBlobDetectionScreenY: [], // For scroll limit detection
        initialBuilds: [], // First 3-5 builds seen without scrolling (most reliable reference)
        runs: 1,
        directionsRun: [direction], // Track which directions have been run
        createdAt: Date.now()
      });
      console.log(`DEBUG: [MAPPER] Created NEW map for "${levelName}" - Run #1 (${direction})`);
    } else {
      // Subsequent run - refine existing map
      const map = this.maps.get(mapKey);
      
      // Reset scroll position to 0 (level always starts at same position)
      map.scrollPosition = 0;
      
      // Clear scroll history for this run (but keep blob data)
      map.scrollHistory = [];
      
      // Increment run counter
      map.runs = (map.runs || 1) + 1;
      
      // Track this direction if not already tracked
      if (!map.directionsRun) {
        map.directionsRun = [direction];
      } else if (!map.directionsRun.includes(direction)) {
        map.directionsRun.push(direction);
      }
      
      // Reset start time for this run
      map.startTime = Date.now();
      
      console.log(`DEBUG: [MAPPER] REFINING existing map for "${levelName}" - Run #${map.runs} (${direction})`);
      console.log(`DEBUG: [MAPPER] Existing map has ${map.blobs.length} builds, directions: ${map.directionsRun.join(', ')}`);
    }

    return this.maps.get(mapKey);
  }

  /**
   * Get current map being tracked
   */
  getCurrentMap() {
    if (!this.currentMapKey) return null;
    return this.maps.get(this.currentMapKey);
  }

  /**
   * Record a scroll action
   * @param {number} distance - Requested scroll distance
   * @param {number} actualMovement - Actual pixel movement (use same as distance if not measured, we validated ~99% accuracy)
   * @param {string} scrollDirection - 'down' or 'up'
   * @param {boolean} mayHitLimit - True if this scroll might hit edge (scrollToTop/Bottom)
   */
  recordScroll(distance, actualMovement, scrollDirection, mayHitLimit = false) {
    const map = this.getCurrentMap();
    if (!map) return;

    // For scrollToTop/scrollToBottom, assume some scrolls hit limit
    // scrollToBottom = 6×300px but may hit limit, use conservative 80%
    // scrollToTop = 10×300px but may hit limit, use conservative 80%
    let effectiveMovement = actualMovement;
    if (mayHitLimit) {
      effectiveMovement = Math.round(actualMovement * 0.8); // Conservative estimate when limits possible
    }

    const hitLimit = mayHitLimit || (Math.abs(effectiveMovement) < Math.abs(distance) * 0.5);

    // Update cumulative scroll position
    // Scroll DOWN = positive offset (content moves up, we see lower parts)
    // Scroll UP = negative offset (content moves down, we see upper parts)
    if (scrollDirection === 'down') {
      map.scrollPosition += effectiveMovement;
    } else {
      map.scrollPosition -= effectiveMovement;
    }

    map.scrollHistory.push({
      distance,
      actualMovement: effectiveMovement,
      scrollDirection,
      hitLimit,
      mayHitLimit,
      scrollPosition: map.scrollPosition,
      timestamp: Date.now()
    });

    const limitNote = mayHitLimit ? ' (may hit limit, using 80%)' : hitLimit ? ' [LIMIT HIT]' : '';
    console.log(`DEBUG: [MAPPER] Scroll ${scrollDirection} ${distance}px → ${effectiveMovement}px, cumulative position: ${map.scrollPosition}px${limitNote}`);
  }

  /**
   * Add a single blob with its build name (captured from OCR)
   * @param {string} buildName - Unique build name from OCR
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   * @param {number} buildNumber - Build number (1, 2, 3...)
   */
  addBuildBlob(buildName, screenX, screenY, buildNumber) {
    const map = this.getCurrentMap();
    if (!map || !buildName) return;

    const absoluteY = screenY + map.scrollPosition;
    const isInitialPosition = map.scrollPosition === 0;

    // Check if we already have this build name
    const existingBlob = map.blobs.find(b => b.buildName === buildName);

    if (!existingBlob) {
      // New blob - build name hasn't been seen before
      const newBlob = {
        buildName,
        buildNumber,
        absoluteY,
        screenX,
        screenY,
        firstDetectedAt: Date.now(),
        scrollPosition: map.scrollPosition,
        seenCount: 1,
        isInitialBuild: isInitialPosition // Mark if seen at starting position (most reliable)
      };
      
      map.blobs.push(newBlob);
      
      // Track initial builds separately for highest confidence reference
      if (isInitialPosition) {
        map.initialBuilds.push(buildName);
      }
      
      const positionNote = isInitialPosition ? ' [INITIAL POSITION - HIGH CONFIDENCE]' : '';
      console.log(`DEBUG: [MAPPER] New build "${buildName}" (#${buildNumber}) mapped at absolute Y:${absoluteY}, screen (${screenX}, ${screenY})${positionNote}`);
    } else {
      // Update existing blob with current screen position (in case we scrolled)
      existingBlob.seenCount++;
      existingBlob.screenY = screenY;
      existingBlob.scrollPosition = map.scrollPosition;
      existingBlob.lastSeenAt = Date.now();
      
      // If absolute Y changed significantly, log it (could indicate mapping issue)
      const yDiff = Math.abs(existingBlob.absoluteY - absoluteY);
      if (yDiff > 20) {
        console.log(`DEBUG: [MAPPER] WARNING: Build "${buildName}" absolute Y changed by ${yDiff}px (${existingBlob.absoluteY} → ${absoluteY}) - possible scroll tracking error`);
      }
      
      console.log(`DEBUG: [MAPPER] Updated build "${buildName}" at screen (${screenX}, ${screenY}), seen ${existingBlob.seenCount}x`);
    }

    // Sort blobs by absolute Y position
    map.blobs.sort((a, b) => a.absoluteY - b.absoluteY);
    
    // Update build count
    map.buildCount = Math.max(map.buildCount || 0, buildNumber);
  }


  /**
   * Get the expected position of the next build
   * @param {number} currentBuildNumber - Current build number just completed
   * @returns {object|null} - {buildName, absoluteY, expectedScreenX, expectedScreenY} or null if unknown
   */
  getNextBuildPosition(currentBuildNumber) {
    const map = this.getCurrentMap();
    if (!map) return null;

    const nextBuildNumber = currentBuildNumber + 1;
    
    // Find the blob with the next build number
    const nextBlob = map.blobs.find(b => b.buildNumber === nextBuildNumber);

    if (nextBlob) {
      // Calculate expected screen position based on current scroll position
      const expectedScreenY = nextBlob.absoluteY - map.scrollPosition;
      
      return {
        buildName: nextBlob.buildName,
        buildNumber: nextBlob.buildNumber,
        absoluteY: nextBlob.absoluteY,
        expectedScreenX: nextBlob.screenX,
        expectedScreenY,
        confidence: nextBlob.seenCount > 1 ? 'high' : 'medium'
      };
    }

    return null;
  }

  /**
   * Get a build by name
   * @param {string} buildName - Name of the build
   * @returns {object|null} - Build blob or null if not found
   */
  getBuildByName(buildName) {
    const map = this.getCurrentMap();
    if (!map) return null;
    
    return map.blobs.find(b => b.buildName === buildName) || null;
  }

  /**
   * Check if we have a build mapped
   * @param {string} buildName - Name of the build
   * @returns {boolean}
   */
  hasBuild(buildName) {
    return this.getBuildByName(buildName) !== null;
  }

  /**
   * Verify scroll position accuracy by checking if a known build is at expected position
   * @param {string} buildName - Build name to check
   * @param {number} currentScreenY - Current screen Y position of the build
   * @returns {object} - {valid: boolean, expectedY, actualY, difference}
   */
  verifyScrollPosition(buildName, currentScreenY) {
    const build = this.getBuildByName(buildName);
    if (!build) {
      return { valid: false, error: 'Build not found in map' };
    }

    const map = this.getCurrentMap();
    if (!map) {
      return { valid: false, error: 'No active map' };
    }

    // Calculate where this build SHOULD be on screen based on our scroll tracking
    const expectedScreenY = build.absoluteY - map.scrollPosition;
    const difference = Math.abs(currentScreenY - expectedScreenY);
    const isValid = difference < 30; // Within 30px is acceptable

    if (!isValid) {
      console.log(`DEBUG: [MAPPER] WARNING: Scroll position validation failed for "${buildName}"`);
      console.log(`  Expected screen Y: ${expectedScreenY}, Actual: ${currentScreenY}, Difference: ${difference}px`);
      console.log(`  This may indicate scroll tracking errors or game animation interference`);
    }

    return {
      valid: isValid,
      buildName,
      expectedScreenY,
      actualScreenY: currentScreenY,
      difference,
      absoluteY: build.absoluteY,
      currentScrollPosition: map.scrollPosition
    };
  }

  /**
   * Stop tracking current level and finalize the map
   */
  stopLevel() {
    const map = this.getCurrentMap();
    if (map) {
      map.endTime = Date.now();
      map.duration = map.endTime - map.startTime;
      console.log(`DEBUG: [MAPPER] Stopped tracking "${map.levelName}" (${map.direction})`);
      console.log(`DEBUG: [MAPPER] Final map: ${map.blobs.length} blobs, ${map.buildCount} builds, ${map.scrollHistory.length} scrolls`);
      this.printMapSummary();
    }
    
    this.currentMapKey = null;
    this.isTracking = false;
  }

  /**
   * Print a summary of the current map
   */
  printMapSummary() {
    const map = this.getCurrentMap();
    if (!map) return;

    const validatedBadge = map.validated ? ' ✅ VALIDATED' : '';
    const runInfo = map.runs ? ` - Run #${map.runs}` : '';
    const directionsInfo = map.directionsRun && map.directionsRun.length > 0 
      ? ` (Directions: ${map.directionsRun.join(', ').toUpperCase()})`
      : '';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`LEVEL MAP: ${map.levelName}${runInfo}${directionsInfo}${validatedBadge}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Builds: ${map.blobs.length}`);
    console.log(`Initial Builds: ${map.initialBuilds ? map.initialBuilds.length : 0}`);
    console.log(`Scrolls This Run: ${map.scrollHistory.length}`);
    console.log(`Final Scroll Position: ${map.scrollPosition}px`);
    console.log(`\nBuild List (sorted by absolute Y):`);
    
    map.blobs.forEach((blob, idx) => {
      const confidenceBadge = blob.isInitialBuild ? '[INITIAL]' : blob.seenCount > 1 ? '[HIGH]' : '[MED]';
      console.log(`  ${idx + 1}. #${blob.buildNumber} "${blob.buildName}" - Y:${blob.absoluteY} X:${blob.screenX} ${confidenceBadge} (seen ${blob.seenCount}x)`);
    });
    
    console.log(`\nScroll History (this run):`);
    if (map.scrollHistory.length === 0) {
      console.log('  (no scrolls this run)');
    } else {
      map.scrollHistory.forEach((scroll, idx) => {
        const limitFlag = scroll.hitLimit ? ' [LIMIT]' : '';
        console.log(`  ${idx + 1}. ${scroll.scrollDirection.toUpperCase()} ${scroll.distance}px → ${scroll.actualMovement}px (pos: ${scroll.scrollPosition}px)${limitFlag}`);
      });
    }
    
    console.log(`${'='.repeat(60)}\n`);
  }

  /**
   * Get a saved map by level name (direction not needed - maps are shared)
   */
  getMap(levelName, direction) {
    // Direction parameter kept for API compatibility but not used
    const mapKey = levelName;
    return this.maps.get(mapKey) || null;
  }

  /**
   * Check if we have a map for a level (direction not needed - maps are shared)
   */
  hasMap(levelName, direction) {
    // Direction parameter kept for API compatibility but not used
    const mapKey = levelName;
    return this.maps.has(mapKey);
  }

  /**
   * Clear all maps
   */
  clearAllMaps() {
    this.maps.clear();
    this.currentMapKey = null;
    this.isTracking = false;
    console.log('DEBUG: [MAPPER] All maps cleared');
  }

  /**
   * Export maps to JSON for saving
   */
  exportMaps() {
    const exported = {};
    for (const [key, map] of this.maps.entries()) {
      exported[key] = map;
    }
    return exported;
  }

  /**
   * Import maps from JSON
   */
  importMaps(data) {
    this.maps.clear();
    for (const [key, map] of Object.entries(data)) {
      this.maps.set(key, map);
    }
    console.log(`DEBUG: [MAPPER] Imported ${this.maps.size} maps`);
  }
}

// Singleton instance
const levelMapper = new LevelMapper();

module.exports = levelMapper;

