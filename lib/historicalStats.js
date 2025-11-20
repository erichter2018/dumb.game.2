/**
 * historicalStats.js
 * Manages persistent historical statistics for levels and stages
 */

const fs = require('fs');
const path = require('path');

const STATS_FILE_PATH = path.join(__dirname, '..', 'data', 'historical-stats.json');

/**
 * Default structure for the stats file
 */
function getDefaultStats() {
    return {
        levels: {
            // "Level Name": {
            //     completions: [duration1, duration2, ...],
            //     averageDuration: number,
            //     totalCompletions: number,
            //     bestTime: number,
            //     worstTime: number
            // }
        },
        stages: {
            // "Stage Name": {
            //     completions: [duration1, duration2, ...],
            //     averageDuration: number,
            //     totalCompletions: number,
            //     bestTime: number,
            //     worstTime: number
            // }
        },
        metadata: {
            lastUpdated: null,
            totalLevelsTracked: 0,
            totalStagesTracked: 0
        }
    };
}

/**
 * Safely loads the stats file, creating a blank one if it doesn't exist
 */
function loadStats() {
    try {
        if (!fs.existsSync(STATS_FILE_PATH)) {
            console.log('Historical stats file not found, creating new one');
            const defaultStats = getDefaultStats();
            saveStats(defaultStats);
            return defaultStats;
        }

        const fileContent = fs.readFileSync(STATS_FILE_PATH, 'utf8');
        const stats = JSON.parse(fileContent);
        
        // Ensure the structure is complete (in case of partial file corruption)
        if (!stats.levels) stats.levels = {};
        if (!stats.stages) stats.stages = {};
        if (!stats.metadata) stats.metadata = getDefaultStats().metadata;
        
        console.log(`Loaded historical stats: ${Object.keys(stats.levels).length} levels, ${Object.keys(stats.stages).length} stages tracked`);
        return stats;
    } catch (error) {
        console.error('Error loading historical stats, creating new file:', error);
        const defaultStats = getDefaultStats();
        saveStats(defaultStats);
        return defaultStats;
    }
}

/**
 * Safely saves the stats file
 */
function saveStats(stats) {
    try {
        stats.metadata.lastUpdated = new Date().toISOString();
        const jsonContent = JSON.stringify(stats, null, 2);
        fs.writeFileSync(STATS_FILE_PATH, jsonContent, 'utf8');
        console.log('Historical stats saved successfully');
    } catch (error) {
        console.error('Error saving historical stats:', error);
    }
}

/**
 * Calculates statistics for a set of completion times
 * Completions can be either numbers (old format) or objects with {duration, direction}
 */
function calculateStats(completions) {
    if (!completions || completions.length === 0) {
        return {
            averageDuration: 0,
            totalCompletions: 0,
            bestTime: 0,
            bestDirection: null,
            worstTime: 0,
            lastTime: 0,
            lastDirection: null
        };
    }

    // Extract durations from completion objects (or use directly if numbers)
    const durations = completions.map(c => typeof c === 'number' ? c : c.duration);
    
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    const average = Math.round(total / completions.length);
    const bestDuration = Math.min(...durations);
    const worst = Math.max(...durations);
    
    // Find best completion with direction info
    const bestIndex = durations.indexOf(bestDuration);
    const bestCompletion = completions[bestIndex];
    const bestDirection = typeof bestCompletion === 'object' ? bestCompletion.direction : null;
    
    // Get last completion with direction info
    const lastCompletion = completions[completions.length - 1];
    const lastDuration = typeof lastCompletion === 'number' ? lastCompletion : lastCompletion.duration;
    const lastDirection = typeof lastCompletion === 'object' ? lastCompletion.direction : null;

    return {
        averageDuration: average,
        totalCompletions: completions.length,
        bestTime: bestDuration,
        bestDirection: bestDirection,
        worstTime: worst,
        lastTime: lastDuration,
        lastDirection: lastDirection
    };
}

/**
 * Records a level completion with direction
 */
function recordLevelCompletion(levelName, durationMs, direction = 'up') {
    if (!levelName || durationMs <= 0) return;

    const stats = loadStats();
    
    // Initialize level stats if it doesn't exist
    if (!stats.levels[levelName]) {
        stats.levels[levelName] = {
            completionsUp: [],
            completionsDown: [],
            averageDuration: 0,
            totalCompletions: 0,
            bestTime: 0,
            bestDirection: null,
            worstTime: 0,
            lastTime: 0,
            lastDirection: null,
            allTimeBestTimeUp: null,
            allTimeBestTimeDown: null
        };
    }
    
    // Ensure both arrays exist (for backward compatibility)
    if (!stats.levels[levelName].completionsUp) {
        stats.levels[levelName].completionsUp = [];
    }
    if (!stats.levels[levelName].completionsDown) {
        stats.levels[levelName].completionsDown = [];
    }

    // ============================================================================
    // TEMPORARY CHANGE: Calculate "all-time best" from lowest of 5 available times
    // TODO: REMOVE THIS TEMPORARY LOGIC - Restore original "preserved forever" behavior
    // ============================================================================
    // Store previous best time BEFORE adding new completion (for accurate delta calculation)
    // TEMPORARY: Calculate from current completions (before adding new one) instead of using stored value
    let previousBestTime = null;
    if (direction === 'up') {
        const upCompletions = stats.levels[levelName].completionsUp || [];
        // CRITICAL: Calculate BEFORE adding new completion to get accurate comparison
        previousBestTime = upCompletions.length > 0 ? Math.min(...upCompletions) : null;
    } else if (direction === 'down') {
        const downCompletions = stats.levels[levelName].completionsDown || [];
        // CRITICAL: Calculate BEFORE adding new completion to get accurate comparison
        previousBestTime = downCompletions.length > 0 ? Math.min(...downCompletions) : null;
    }
    
    // Add the new completion to the appropriate direction array (keep only last 5 per direction)
    if (direction === 'up') {
        stats.levels[levelName].completionsUp.push(durationMs);
        if (stats.levels[levelName].completionsUp.length > 5) {
            stats.levels[levelName].completionsUp.shift(); // Remove oldest
        }
    } else if (direction === 'down') {
        stats.levels[levelName].completionsDown.push(durationMs);
        if (stats.levels[levelName].completionsDown.length > 5) {
            stats.levels[levelName].completionsDown.shift(); // Remove oldest
        }
    }
    
    // TEMPORARY: Calculate "all-time best" from lowest of current 5 completions
    // ORIGINAL BEHAVIOR (to restore): Preserved forever, only updated if beaten
    if (direction === 'up') {
        const upCompletions = stats.levels[levelName].completionsUp || [];
        if (upCompletions.length > 0) {
            // TEMPORARY: Always recalculate from current 5 completions
            stats.levels[levelName].allTimeBestTimeUp = Math.min(...upCompletions);
            console.log(`TEMPORARY: Calculated all-time best (UP) for "${levelName}" from ${upCompletions.length} completions: ${stats.levels[levelName].allTimeBestTimeUp}ms`);
        } else {
            stats.levels[levelName].allTimeBestTimeUp = null;
        }
    } else if (direction === 'down') {
        const downCompletions = stats.levels[levelName].completionsDown || [];
        if (downCompletions.length > 0) {
            // TEMPORARY: Always recalculate from current 5 completions
            stats.levels[levelName].allTimeBestTimeDown = Math.min(...downCompletions);
            console.log(`TEMPORARY: Calculated all-time best (DOWN) for "${levelName}" from ${downCompletions.length} completions: ${stats.levels[levelName].allTimeBestTimeDown}ms`);
        } else {
            stats.levels[levelName].allTimeBestTimeDown = null;
        }
    }
    // ============================================================================
    // END TEMPORARY CHANGE
    // ============================================================================
    
    // Recalculate combined stats from both direction arrays (after updating all-time best)
    const allCompletions = [
        ...stats.levels[levelName].completionsUp.map(d => ({ duration: d, direction: 'up' })),
        ...stats.levels[levelName].completionsDown.map(d => ({ duration: d, direction: 'down' }))
    ];
    const calculatedStats = calculateStats(allCompletions);
    Object.assign(stats.levels[levelName], calculatedStats);

    // Update metadata
    stats.metadata.totalLevelsTracked = Object.keys(stats.levels).length;

    saveStats(stats);
    
    const upCount = stats.levels[levelName].completionsUp.length;
    const downCount = stats.levels[levelName].completionsDown.length;
    console.log(`Recorded level completion: "${levelName}" (${durationMs}ms, ${direction}) - Tracking: ${upCount} up, ${downCount} down`);
    
    // Return the previous best time for delta calculation
    return previousBestTime;
}

/**
 * Records a stage completion
 */
function recordStageCompletion(stageName, durationMs, stageNumber = null) {
    if (!stageName || durationMs <= 0) return;

    const stats = loadStats();
    
    // Initialize stage stats if it doesn't exist
    if (!stats.stages[stageName]) {
        stats.stages[stageName] = {
            completions: [],
            averageDuration: 0,
            totalCompletions: 0,
            bestTime: 0,
            worstTime: 0,
            lastTime: 0
        };
    }

    // Add the new completion (keep only last 5)
    stats.stages[stageName].completions.push(durationMs);
    if (stats.stages[stageName].completions.length > 5) {
        stats.stages[stageName].completions.shift(); // Remove oldest
    }
    
    // Recalculate stats (exclude direction fields since stages don't have directions)
    const calculatedStats = calculateStats(stats.stages[stageName].completions);
    const { bestDirection, lastDirection, ...stageStats } = calculatedStats;
    Object.assign(stats.stages[stageName], stageStats);

    // Update metadata
    stats.metadata.totalStagesTracked = Object.keys(stats.stages).length;
    
    // Track last completed stage for deduction purposes
    stats.metadata.lastCompletedStage = {
        name: stageName,
        stageNumber: stageNumber,
        completedAt: new Date().toISOString()
    };

    saveStats(stats);
    console.log(`Recorded stage completion: "${stageName}" (${durationMs}ms) - Average: ${stats.stages[stageName].averageDuration}ms`);
}

/**
 * Gets the average duration for a specific level (combined from both directions)
 */
function getLevelAverage(levelName) {
    if (!levelName) return null;

    const stats = loadStats();
    const levelStats = stats.levels[levelName];
    
    if (!levelStats || levelStats.totalCompletions === 0) {
        return null;
    }

    return levelStats.averageDuration;
}

/**
 * Gets the average duration for a specific level, separated by direction
 * Returns { up: number, down: number }
 */
function getLevelAverageByDirection(levelName) {
    if (!levelName) return { up: null, down: null };

    const stats = loadStats();
    const levelStats = stats.levels[levelName];
    
    if (!levelStats) {
        return { up: null, down: null };
    }

    // Calculate average for 'up' direction
    let avgUp = null;
    if (levelStats.completionsUp && levelStats.completionsUp.length > 0) {
        const sum = levelStats.completionsUp.reduce((a, b) => a + b, 0);
        avgUp = Math.round(sum / levelStats.completionsUp.length);
    }

    // Calculate average for 'down' direction
    let avgDown = null;
    if (levelStats.completionsDown && levelStats.completionsDown.length > 0) {
        const sum = levelStats.completionsDown.reduce((a, b) => a + b, 0);
        avgDown = Math.round(sum / levelStats.completionsDown.length);
    }

    return { up: avgUp, down: avgDown };
}

function getLevelBest(levelName) {
    if (!levelName) return null;

    const stats = loadStats();
    const levelStats = stats.levels[levelName];
    
    if (!levelStats || levelStats.totalCompletions === 0) {
        return null;
    }

    // ============================================================================
    // TEMPORARY CHANGE: Calculate "all-time best" from lowest of 5 available times
    // TODO: REMOVE THIS TEMPORARY LOGIC - Restore original stored value behavior
    // ============================================================================
    // TEMPORARY: Calculate best from current completions instead of using stored values
    const upCompletions = levelStats.completionsUp || [];
    const downCompletions = levelStats.completionsDown || [];
    
    const bestUp = upCompletions.length > 0 ? Math.min(...upCompletions) : null;
    const bestDown = downCompletions.length > 0 ? Math.min(...downCompletions) : null;
    
    // ORIGINAL BEHAVIOR (to restore):
    // return {
    //     up: levelStats.allTimeBestTimeUp !== null ? levelStats.allTimeBestTimeUp : null,
    //     down: levelStats.allTimeBestTimeDown !== null ? levelStats.allTimeBestTimeDown : null
    // };
    
    return {
        up: bestUp,
        down: bestDown
    };
    // ============================================================================
    // END TEMPORARY CHANGE
    // ============================================================================
}

function getLevelLast(levelName) {
    if (!levelName) return null;

    const stats = loadStats();
    const levelStats = stats.levels[levelName];
    
    if (!levelStats) {
        return { up: null, down: null };
    }

    // Get the last (most recent) completion for each direction
    let lastUp = null;
    if (levelStats.completionsUp && levelStats.completionsUp.length > 0) {
        lastUp = levelStats.completionsUp[levelStats.completionsUp.length - 1];
    }

    let lastDown = null;
    if (levelStats.completionsDown && levelStats.completionsDown.length > 0) {
        lastDown = levelStats.completionsDown[levelStats.completionsDown.length - 1];
    }

    return { up: lastUp, down: lastDown };
}

/**
 * Gets the average duration for a specific stage
 */
function getStageAverage(stageName) {
    if (!stageName) return null;

    const stats = loadStats();
    const stageStats = stats.stages[stageName];
    
    if (!stageStats || stageStats.totalCompletions === 0) {
        return null;
    }

    return stageStats.averageDuration;
}

function getStageBest(stageName) {
    if (!stageName) return null;

    const stats = loadStats();
    const stageStats = stats.stages[stageName];
    
    if (!stageStats || stageStats.totalCompletions === 0) {
        return null;
    }

    return stageStats.bestTime;
}

function getStageLast(stageName) {
    if (!stageName) return null;

    const stats = loadStats();
    const stageStats = stats.stages[stageName];
    
    if (!stageStats || stageStats.totalCompletions === 0) {
        return null;
    }

    return stageStats.lastTime;
}

/**
 * Gets all level statistics (for debugging/analysis)
 */
function getAllLevelStats() {
    const stats = loadStats();
    return stats.levels;
}

/**
 * Gets all stage statistics (for debugging/analysis)
 */
function getAllStageStats() {
    const stats = loadStats();
    return stats.stages;
}

/**
 * Formats duration in milliseconds to a readable string
 */
function formatDuration(durationMs) {
    if (!durationMs || durationMs <= 0) return '';
    
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Gets the last completed stage information
 */
function getLastCompletedStage() {
    const stats = loadStats();
    return stats.metadata.lastCompletedStage || null;
}

/**
 * Recalculates all-time best times from current completions
 * Useful if statistics get corrupted or need to be reset
 * @returns {Object} Summary of changes
 */
function recalculateAllTimeBests() {
    // ============================================================================
    // TEMPORARY CHANGE: Calculate "all-time best" from lowest of 5 available times
    // TODO: REMOVE THIS TEMPORARY LOGIC - Restore original "preserved forever" behavior
    // ============================================================================
    const stats = loadStats();
    let updatedCount = 0;
    let unchangedCount = 0;
    const changes = [];
    
    Object.entries(stats.levels).forEach(([levelName, levelStats]) => {
        // Use the actual data structure: completionsUp and completionsDown arrays
        const upCompletions = levelStats.completionsUp || [];
        const downCompletions = levelStats.completionsDown || [];
        
        // Skip if no completions at all
        if (upCompletions.length === 0 && downCompletions.length === 0) {
            return;
        }
        
        let levelChanged = false;
        
        // TEMPORARY: Find best for UP direction from current completions (always recalculate)
        // ORIGINAL BEHAVIOR (to restore): Only update if new best is better than stored value
        if (upCompletions.length > 0) {
            const bestUp = Math.min(...upCompletions);
            const oldBestUp = levelStats.allTimeBestTimeUp;
            
            // TEMPORARY: Always set to calculated best from completions
            levelStats.allTimeBestTimeUp = bestUp;
            
            if (oldBestUp !== bestUp) {
                levelChanged = true;
                changes.push({
                    level: levelName,
                    direction: 'up',
                    oldBest: oldBestUp,
                    newBest: bestUp
                });
            }
        }
        
        // TEMPORARY: Find best for DOWN direction from current completions (always recalculate)
        // ORIGINAL BEHAVIOR (to restore): Only update if new best is better than stored value
        if (downCompletions.length > 0) {
            const bestDown = Math.min(...downCompletions);
            const oldBestDown = levelStats.allTimeBestTimeDown;
            
            // TEMPORARY: Always set to calculated best from completions
            levelStats.allTimeBestTimeDown = bestDown;
            
            if (oldBestDown !== bestDown) {
                levelChanged = true;
                changes.push({
                    level: levelName,
                    direction: 'down',
                    oldBest: oldBestDown,
                    newBest: bestDown
                });
            }
        }
        
        // Count this level
        if (levelChanged) {
            updatedCount++;
        } else {
            unchangedCount++;
        }
    });
    
    saveStats(stats);
    
    console.log(`TEMPORARY: Recalculated all-time bests from current completions: ${updatedCount} updated, ${unchangedCount} unchanged`);
    
    return {
        success: true,
        updatedCount,
        unchangedCount,
        changes
    };
    // ============================================================================
    // END TEMPORARY CHANGE
    // ============================================================================
}

/**
 * Delete a level from historical stats
 * @param {string} levelName - The name of the level to delete
 * @returns {object} Result object with success status
 */
function deleteLevel(levelName) {
    try {
        const stats = loadStats();
        
        if (!stats.levels[levelName]) {
            return { success: false, error: `Level "${levelName}" not found in historical stats` };
        }
        
        // Delete the level from stats
        delete stats.levels[levelName];
        
        // Update metadata
        stats.metadata.totalLevelsTracked = Object.keys(stats.levels).length;
        stats.metadata.lastUpdated = new Date().toISOString();
        
        // Save the updated stats
        saveStats(stats);
        
        console.log(`Successfully deleted level "${levelName}" from historical stats`);
        return { success: true };
        
    } catch (error) {
        console.error(`Error deleting level "${levelName}":`, error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    recordLevelCompletion,
    recordStageCompletion,
    getLevelAverage,
    getLevelAverageByDirection,
    getLevelBest,
    getLevelLast,
    getStageAverage,
    getStageBest,
    getStageLast,
    getAllLevelStats,
    getAllStageStats,
    formatDuration,
    loadStats,
    saveStats,
    getLastCompletedStage,
    recalculateAllTimeBests,
    deleteLevel
};

