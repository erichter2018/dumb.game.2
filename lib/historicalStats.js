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
            completions: [],
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

    // Add the new completion with direction (keep only last 5)
    stats.levels[levelName].completions.push({
        duration: durationMs,
        direction: direction
    });
    if (stats.levels[levelName].completions.length > 5) {
        stats.levels[levelName].completions.shift(); // Remove oldest
    }
    
    // Recalculate stats (from rolling 5 completions)
    const calculatedStats = calculateStats(stats.levels[levelName].completions);
    Object.assign(stats.levels[levelName], calculatedStats);
    
    // Update all-time best for this direction (preserved forever, only updated if beaten)
    if (direction === 'up') {
        const currentBest = stats.levels[levelName].allTimeBestTimeUp;
        if (currentBest === null || durationMs < currentBest) {
            stats.levels[levelName].allTimeBestTimeUp = durationMs;
            console.log(`New all-time best (UP) for "${levelName}": ${durationMs}ms`);
        }
    } else if (direction === 'down') {
        const currentBest = stats.levels[levelName].allTimeBestTimeDown;
        if (currentBest === null || durationMs < currentBest) {
            stats.levels[levelName].allTimeBestTimeDown = durationMs;
            console.log(`New all-time best (DOWN) for "${levelName}": ${durationMs}ms`);
        }
    }

    // Update metadata
    stats.metadata.totalLevelsTracked = Object.keys(stats.levels).length;

    saveStats(stats);
    console.log(`Recorded level completion: "${levelName}" (${durationMs}ms, ${direction}) - Average: ${stats.levels[levelName].averageDuration}ms`);
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
    
    // Recalculate stats
    const calculatedStats = calculateStats(stats.stages[stageName].completions);
    Object.assign(stats.stages[stageName], calculatedStats);

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
 * Gets the average duration for a specific level
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

function getLevelBest(levelName) {
    if (!levelName) return null;

    const stats = loadStats();
    const levelStats = stats.levels[levelName];
    
    if (!levelStats || levelStats.totalCompletions === 0) {
        return null;
    }

    // Return all-time bests for both directions
    return {
        up: levelStats.allTimeBestTimeUp !== null ? levelStats.allTimeBestTimeUp : null,
        down: levelStats.allTimeBestTimeDown !== null ? levelStats.allTimeBestTimeDown : null
    };
}

function getLevelLast(levelName) {
    if (!levelName) return null;

    const stats = loadStats();
    const levelStats = stats.levels[levelName];
    
    if (!levelStats || levelStats.totalCompletions === 0) {
        return null;
    }

    return {
        time: levelStats.lastTime,
        direction: levelStats.lastDirection
    };
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
    const stats = loadStats();
    let updatedCount = 0;
    let unchangedCount = 0;
    const changes = [];
    
    Object.entries(stats.levels).forEach(([levelName, levelStats]) => {
        const completions = levelStats.completions || [];
        if (completions.length === 0) return;
        
        // Separate completions by direction
        const upCompletions = completions.filter(c => {
            const dir = typeof c === 'object' ? c.direction : 'up';
            return dir === 'up';
        });
        const downCompletions = completions.filter(c => {
            const dir = typeof c === 'object' ? c.direction : null;
            return dir === 'down';
        });
        
        // Find best for UP direction
        if (upCompletions.length > 0) {
            const upDurations = upCompletions.map(c => typeof c === 'number' ? c : c.duration);
            const bestUp = Math.min(...upDurations);
            const oldBestUp = levelStats.allTimeBestTimeUp;
            
            levelStats.allTimeBestTimeUp = bestUp;
            
            if (oldBestUp !== bestUp) {
                updatedCount++;
                changes.push({
                    level: levelName,
                    direction: 'up',
                    oldBest: oldBestUp,
                    newBest: bestUp
                });
            }
        }
        
        // Find best for DOWN direction
        if (downCompletions.length > 0) {
            const downDurations = downCompletions.map(c => typeof c === 'number' ? c : c.duration);
            const bestDown = Math.min(...downDurations);
            const oldBestDown = levelStats.allTimeBestTimeDown;
            
            levelStats.allTimeBestTimeDown = bestDown;
            
            if (oldBestDown !== bestDown) {
                updatedCount++;
                changes.push({
                    level: levelName,
                    direction: 'down',
                    oldBest: oldBestDown,
                    newBest: bestDown
                });
            }
        }
        
        if (upCompletions.length === 0 && downCompletions.length === 0) {
            unchangedCount++;
        }
    });
    
    saveStats(stats);
    
    console.log(`Recalculated all-time bests: ${updatedCount} updated, ${unchangedCount} unchanged`);
    
    return {
        success: true,
        updatedCount,
        unchangedCount,
        changes
    };
}

module.exports = {
    recordLevelCompletion,
    recordStageCompletion,
    getLevelAverage,
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
    recalculateAllTimeBests
};

