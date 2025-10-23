/**
 * dailyStats.js
 * Manages daily statistics tracking for levels and stages completed
 */

const fs = require('fs');
const path = require('path');

const DAILY_STATS_FILE = path.join(__dirname, '..', 'data', 'daily-stats.json');

/**
 * Get default structure for daily stats
 */
function getDefaultStats() {
    return {
        days: {
            // "YYYY-MM-DD": {
            //     levelsCompleted: 0,
            //     stagesCompleted: 0,
            //     levelTimes: [],
            //     stageTimes: [],
            //     minLevelTime: null,
            //     maxLevelTime: null,
            //     avgLevelTime: null,
            //     minStageTime: null,
            //     maxStageTime: null,
            //     avgStageTime: null
            // }
        },
        lastKnownLevel: null,
        lastSaveDate: null
    };
}

/**
 * Load daily stats from file
 */
function loadStats() {
    try {
        if (!fs.existsSync(DAILY_STATS_FILE)) {
            console.log('Daily stats file not found, creating new one');
            const defaultStats = getDefaultStats();
            saveStats(defaultStats);
            return defaultStats;
        }

        const fileContent = fs.readFileSync(DAILY_STATS_FILE, 'utf8');
        const stats = JSON.parse(fileContent);
        
        // Ensure structure is complete
        if (!stats.days) stats.days = {};
        if (!stats.lastKnownLevel) stats.lastKnownLevel = null;
        if (!stats.lastSaveDate) stats.lastSaveDate = null;
        
        return stats;
    } catch (error) {
        console.error('Error loading daily stats:', error);
        const defaultStats = getDefaultStats();
        saveStats(defaultStats);
        return defaultStats;
    }
}

/**
 * Save daily stats to file
 */
function saveStats(stats) {
    try {
        const jsonContent = JSON.stringify(stats, null, 2);
        fs.writeFileSync(DAILY_STATS_FILE, jsonContent, 'utf8');
    } catch (error) {
        console.error('Error saving daily stats:', error);
    }
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

/**
 * Initialize or get stats for a specific day
 */
function getOrCreateDayStats(stats, dateString) {
    if (!stats.days[dateString]) {
        stats.days[dateString] = {
            levelsCompleted: 0,
            stagesCompleted: 0,
            levelTimes: [],
            stageTimes: [],
            minLevelTime: null,
            maxLevelTime: null,
            avgLevelTime: null,
            minStageTime: null,
            maxStageTime: null,
            avgStageTime: null
        };
    }
    return stats.days[dateString];
}

/**
 * Calculate min/max/avg from array of times
 */
function calculateTimeStats(times) {
    if (times.length === 0) {
        return { min: null, max: null, avg: null };
    }
    
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = Math.round(times.reduce((sum, t) => sum + t, 0) / times.length);
    
    return { min, max, avg };
}

/**
 * Record a level completion for today
 */
function recordLevelCompletion(durationMs) {
    if (!durationMs || durationMs <= 0) return;
    
    const stats = loadStats();
    const today = getTodayString();
    const dayStats = getOrCreateDayStats(stats, today);
    
    dayStats.levelsCompleted++;
    dayStats.levelTimes.push(durationMs);
    
    // Recalculate stats
    const timeStats = calculateTimeStats(dayStats.levelTimes);
    dayStats.minLevelTime = timeStats.min;
    dayStats.maxLevelTime = timeStats.max;
    dayStats.avgLevelTime = timeStats.avg;
    
    // VALIDATION: Counts should be >= time arrays (offline play adds to counts but not times)
    if (dayStats.levelsCompleted < dayStats.levelTimes.length) {
        console.error(`⚠️  DAILY STATS MISMATCH: levelsCompleted (${dayStats.levelsCompleted}) < levelTimes.length (${dayStats.levelTimes.length})`);
        // Fix it
        dayStats.levelsCompleted = dayStats.levelTimes.length;
        console.log(`   Fixed: Reset levelsCompleted to ${dayStats.levelsCompleted}`);
    }
    
    // VALIDATION: Stages completed should be reasonable relative to levels
    // Approximately 7 levels = 1 stage, but can vary with offline play
    const minExpectedStages = Math.floor(dayStats.levelsCompleted / 10); // Very loose minimum
    const maxExpectedStages = Math.ceil(dayStats.levelsCompleted / 5); // Very loose maximum
    
    if (dayStats.levelsCompleted >= 14 && dayStats.stagesCompleted < minExpectedStages) {
        console.warn(`⚠️  DAILY STATS WARNING: ${dayStats.levelsCompleted} levels but only ${dayStats.stagesCompleted} stages (expected at least ${minExpectedStages})`);
    } else if (dayStats.stagesCompleted > maxExpectedStages) {
        console.warn(`⚠️  DAILY STATS WARNING: ${dayStats.stagesCompleted} stages seems high for ${dayStats.levelsCompleted} levels (expected max ~${maxExpectedStages})`);
    }
    
    stats.lastSaveDate = new Date().toISOString();
    saveStats(stats);
    
    console.log(`DAILY STATS: Recorded level completion (${durationMs}ms) for ${today}. Total today: ${dayStats.levelsCompleted}`);
}

/**
 * Record a stage completion for today
 */
function recordStageCompletion(durationMs) {
    if (!durationMs || durationMs <= 0) return;

    const stats = loadStats();
    const today = getTodayString();
    const dayStats = getOrCreateDayStats(stats, today);
    
    dayStats.stagesCompleted++;
    dayStats.stageTimes.push(durationMs);
    
    // Recalculate stats
    const timeStats = calculateTimeStats(dayStats.stageTimes);
    dayStats.minStageTime = timeStats.min;
    dayStats.maxStageTime = timeStats.max;
    dayStats.avgStageTime = timeStats.avg;
    
    // VALIDATION: Counts should be >= time arrays (offline play adds to counts but not times)
    if (dayStats.stagesCompleted < dayStats.stageTimes.length) {
        console.error(`⚠️  DAILY STATS MISMATCH: stagesCompleted (${dayStats.stagesCompleted}) < stageTimes.length (${dayStats.stageTimes.length})`);
        // Fix it
        dayStats.stagesCompleted = dayStats.stageTimes.length;
        console.log(`   Fixed: Reset stagesCompleted to ${dayStats.stagesCompleted}`);
    }
    
    stats.lastSaveDate = new Date().toISOString();
    saveStats(stats);
    
    console.log(`DAILY STATS: Recorded stage completion (${durationMs}ms) for ${today}. Total today: ${dayStats.stagesCompleted}`);
}

/**
 * Update the last known level position
 * @param {string} stageName - Name of the stage
 * @param {number} stageNumber - Stage number (1-60)
 * @param {string} levelName - Name of the level
 * @param {number} levelPosition - Position within stage (1-7)
 */
function updateLastKnownLevel(stageName, stageNumber, levelName, levelPosition) {
    const stats = loadStats();
    stats.lastKnownLevel = {
        stageName,
        stageNumber,
        levelName,
        levelPosition,
        timestamp: new Date().toISOString()
    };
    stats.lastSaveDate = new Date().toISOString();
    saveStats(stats);
}

/**
 * Check for offline play and distribute levels if detected
 * @param {string} currentStageName - Current stage name
 * @param {number} currentStageNumber - Current stage number (1-60)
 * @param {string} currentLevelName - Current level name
 * @param {number} currentLevelPosition - Current position within stage (1-7)
 * @returns {number} Number of offline levels detected
 */
function checkAndHandleOfflinePlay(currentStageName, currentStageNumber, currentLevelName, currentLevelPosition) {
    const stats = loadStats();
    
    // If no previous data, nothing to check
    if (!stats.lastKnownLevel || !stats.lastSaveDate) {
        console.log('OFFLINE CHECK: No previous level data, skipping offline detection');
        return 0;
    }
    
    const lastKnown = stats.lastKnownLevel;
    
    // Calculate absolute position (assuming 7 levels per stage, 60 stages that rotate)
    const lastAbsolutePosition = ((lastKnown.stageNumber - 1) * 7) + lastKnown.levelPosition;
    const currentAbsolutePosition = ((currentStageNumber - 1) * 7) + currentLevelPosition;
    
    // Calculate difference (accounting for rotation at 420 = 60 stages * 7 levels)
    let levelDifference;
    if (currentAbsolutePosition >= lastAbsolutePosition) {
        levelDifference = currentAbsolutePosition - lastAbsolutePosition;
    } else {
        // Wrapped around after stage 60
        levelDifference = (420 - lastAbsolutePosition) + currentAbsolutePosition;
    }
    
    console.log(`OFFLINE CHECK: Last known: Stage ${lastKnown.stageNumber} Level ${lastKnown.levelPosition} (absolute: ${lastAbsolutePosition})`);
    console.log(`OFFLINE CHECK: Current: Stage ${currentStageNumber} Level ${currentLevelPosition} (absolute: ${currentAbsolutePosition})`);
    console.log(`OFFLINE CHECK: Level difference: ${levelDifference}`);
    
    // If difference is 1 or 0, no offline play (normal progression or same level)
    if (levelDifference <= 1) {
        console.log('OFFLINE CHECK: Normal progression, no offline play detected');
        return 0;
    }
    
    // Offline play detected!
    // Simple math: position difference = offline levels
    const offlineLevels = levelDifference - 1; // -1 because current level not finished yet
    
    // Calculate stages: how many stage boundaries did we cross?
    let completeOfflineStages = 0;
    
    if (currentStageNumber !== lastKnown.stageNumber) {
        // We crossed into a different stage
        // Calculate how many stage numbers apart we are
        if (currentStageNumber > lastKnown.stageNumber) {
            // Normal forward progression: stages 41 -> 42 = 1 stage crossed
            // But we need to check: did we COMPLETE those stages or are we mid-stage?
            const stageNumberDiff = currentStageNumber - lastKnown.stageNumber;
            
            // If we're at level 1 of new stage: all previous stages were completed
            // If we're at level > 1: we're mid-stage, so one less completed
            completeOfflineStages = (currentLevelPosition === 1) ? stageNumberDiff : stageNumberDiff - 1;
        } else {
            // Wrapped around stage 60 back to stage 1
            const stageNumberDiff = (60 - lastKnown.stageNumber) + currentStageNumber;
            completeOfflineStages = (currentLevelPosition === 1) ? stageNumberDiff : stageNumberDiff - 1;
        }
        
        // Can't have negative stages
        completeOfflineStages = Math.max(0, completeOfflineStages);
    }
    // If same stage number, no stages were completed (just levels within same stage)
    
    console.log(`OFFLINE CHECK: Detected ${offlineLevels} offline levels, ${completeOfflineStages} complete stages (stage ${lastKnown.stageNumber} → ${currentStageNumber})`);
    console.log(`  (Adding to daily stats to track total game progress, not just app automation)`);
    
    // Add offline levels and stages to daily stats
    // NOTE: We add to the COUNTS but NOT to the time arrays (since we don't have timing data for manual play)
    if (offlineLevels > 0 || completeOfflineStages > 0) {
        const lastDate = new Date(stats.lastSaveDate);
        const now = new Date();
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysDiff = Math.floor((now - lastDate) / msPerDay);
        
        if (daysDiff < 1) {
            // Same day - add to today
            const today = getTodayString();
            const dayStats = getOrCreateDayStats(stats, today);
            dayStats.levelsCompleted += offlineLevels;
            dayStats.stagesCompleted += completeOfflineStages;
            console.log(`  Added ${offlineLevels} offline levels, ${completeOfflineStages} offline stages to today (${today})`);
        } else {
            // Multiple days - distribute evenly
            const levelsPerDay = Math.ceil(offlineLevels / daysDiff);
            const stagesPerDay = Math.ceil(completeOfflineStages / daysDiff);
            console.log(`  Distributing ${offlineLevels} levels and ${completeOfflineStages} stages across ${daysDiff} days`);
            
            let remainingLevels = offlineLevels;
            let remainingStages = completeOfflineStages;
            
            for (let i = 0; i < daysDiff && (remainingLevels > 0 || remainingStages > 0); i++) {
                const date = new Date(lastDate);
                date.setDate(date.getDate() + i + 1);
                const dateString = date.toISOString().split('T')[0];
                
                const levelsForThisDay = Math.min(levelsPerDay, remainingLevels);
                const stagesForThisDay = Math.min(stagesPerDay, remainingStages);
                
                const dayStats = getOrCreateDayStats(stats, dateString);
                dayStats.levelsCompleted += levelsForThisDay;
                dayStats.stagesCompleted += stagesForThisDay;
                
                remainingLevels -= levelsForThisDay;
                remainingStages -= stagesForThisDay;
                
                console.log(`  Added ${levelsForThisDay} levels, ${stagesForThisDay} stages to ${dateString}`);
            }
        }
    }
    
    saveStats(stats);
    return offlineLevels;
}

/**
 * Get stats for the last N days
 */
function getRecentDays(days = 7) {
    const stats = loadStats();
    const result = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        
        const dayStats = stats.days[dateString] || {
            levelsCompleted: 0,
            stagesCompleted: 0,
            minLevelTime: null,
            maxLevelTime: null,
            avgLevelTime: null,
            minStageTime: null,
            maxStageTime: null,
            avgStageTime: null
        };
        
        result.push({
            date: dateString,
            ...dayStats
        });
    }
    
    return result;
}

/**
 * Get today's stats
 */
function getTodayStats() {
    const stats = loadStats();
    const today = getTodayString();
    
    return stats.days[today] || {
        levelsCompleted: 0,
        stagesCompleted: 0,
        minLevelTime: null,
        maxLevelTime: null,
        avgLevelTime: null,
        minStageTime: null,
        maxStageTime: null,
        avgStageTime: null
    };
}

module.exports = {
    loadStats,
    saveStats,
    recordLevelCompletion,
    recordStageCompletion,
    updateLastKnownLevel,
    checkAndHandleOfflinePlay,
    getRecentDays,
    getTodayStats
};

