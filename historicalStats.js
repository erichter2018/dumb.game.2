/**
 * historicalStats.js
 * Manages persistent historical statistics for levels and stages
 */

const fs = require('fs');
const path = require('path');

const STATS_FILE_PATH = path.join(__dirname, 'historical-stats.json');

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
 */
function calculateStats(completions) {
    if (!completions || completions.length === 0) {
        return {
            averageDuration: 0,
            totalCompletions: 0,
            bestTime: 0,
            worstTime: 0
        };
    }

    const total = completions.reduce((sum, duration) => sum + duration, 0);
    const average = Math.round(total / completions.length);
    const best = Math.min(...completions);
    const worst = Math.max(...completions);

    return {
        averageDuration: average,
        totalCompletions: completions.length,
        bestTime: best,
        worstTime: worst
    };
}

/**
 * Records a level completion
 */
function recordLevelCompletion(levelName, durationMs) {
    if (!levelName || durationMs <= 0) return;

    const stats = loadStats();
    
    // Initialize level stats if it doesn't exist
    if (!stats.levels[levelName]) {
        stats.levels[levelName] = {
            completions: [],
            averageDuration: 0,
            totalCompletions: 0,
            bestTime: 0,
            worstTime: 0
        };
    }

    // Add the new completion
    stats.levels[levelName].completions.push(durationMs);
    
    // Recalculate stats
    const calculatedStats = calculateStats(stats.levels[levelName].completions);
    Object.assign(stats.levels[levelName], calculatedStats);

    // Update metadata
    stats.metadata.totalLevelsTracked = Object.keys(stats.levels).length;

    saveStats(stats);
    console.log(`Recorded level completion: "${levelName}" (${durationMs}ms) - Average: ${stats.levels[levelName].averageDuration}ms`);
}

/**
 * Records a stage completion
 */
function recordStageCompletion(stageName, durationMs) {
    if (!stageName || durationMs <= 0) return;

    const stats = loadStats();
    
    // Initialize stage stats if it doesn't exist
    if (!stats.stages[stageName]) {
        stats.stages[stageName] = {
            completions: [],
            averageDuration: 0,
            totalCompletions: 0,
            bestTime: 0,
            worstTime: 0
        };
    }

    // Add the new completion
    stats.stages[stageName].completions.push(durationMs);
    
    // Recalculate stats
    const calculatedStats = calculateStats(stats.stages[stageName].completions);
    Object.assign(stats.stages[stageName], calculatedStats);

    // Update metadata
    stats.metadata.totalStagesTracked = Object.keys(stats.stages).length;

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

    return levelStats.bestTime;
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

module.exports = {
    recordLevelCompletion,
    recordStageCompletion,
    getLevelAverage,
    getLevelBest,
    getStageAverage,
    getStageBest,
    getAllLevelStats,
    getAllStageStats,
    formatDuration,
    loadStats,
    saveStats
};

