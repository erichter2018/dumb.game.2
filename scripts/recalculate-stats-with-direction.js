#!/usr/bin/env node
/**
 * Recalculation Script: Add bestDirection and lastDirection to all levels
 * 
 * The migration script converted completions to {duration, direction} format,
 * but didn't recalculate the top-level bestDirection and lastDirection properties.
 * This script fixes that.
 */

const fs = require('fs');
const path = require('path');

const STATS_FILE_PATH = path.join(__dirname, '..', 'data', 'historical-stats.json');
const BACKUP_FILE_PATH = path.join(__dirname, '..', 'data', 'historical-stats.backup-pre-recalc.json');

console.log('='.repeat(60));
console.log('RECALCULATION: Adding Direction Stats to All Levels');
console.log('='.repeat(60));

// Load the current stats file
let stats;
try {
    const fileContent = fs.readFileSync(STATS_FILE_PATH, 'utf8');
    stats = JSON.parse(fileContent);
    console.log('✓ Loaded existing stats file');
} catch (error) {
    console.error('✗ Failed to load stats file:', error.message);
    process.exit(1);
}

// Create backup
try {
    fs.writeFileSync(BACKUP_FILE_PATH, JSON.stringify(stats, null, 2), 'utf8');
    console.log(`✓ Created backup at: ${BACKUP_FILE_PATH}`);
} catch (error) {
    console.error('✗ Failed to create backup:', error.message);
    process.exit(1);
}

/**
 * Calculate stats from completions array
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

// Recalculate stats for all levels
let levelsUpdated = 0;

console.log('\nRecalculating level stats...');
for (const [levelName, levelStats] of Object.entries(stats.levels)) {
    if (levelStats.completions && levelStats.completions.length > 0) {
        const calculatedStats = calculateStats(levelStats.completions);
        
        // Update the level stats with calculated values
        levelStats.averageDuration = calculatedStats.averageDuration;
        levelStats.totalCompletions = calculatedStats.totalCompletions;
        levelStats.bestTime = calculatedStats.bestTime;
        levelStats.bestDirection = calculatedStats.bestDirection;
        levelStats.worstTime = calculatedStats.worstTime;
        levelStats.lastTime = calculatedStats.lastTime;
        levelStats.lastDirection = calculatedStats.lastDirection;
        
        levelsUpdated++;
        console.log(`  ✓ ${levelName}: best=${calculatedStats.bestTime} (${calculatedStats.bestDirection}), last=${calculatedStats.lastTime} (${calculatedStats.lastDirection})`);
    }
}

// Save the updated stats
try {
    stats.metadata.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(stats, null, 2), 'utf8');
    console.log('\n✓ Successfully saved recalculated stats');
} catch (error) {
    console.error('\n✗ Failed to save recalculated stats:', error.message);
    console.error('   You can restore from backup at:', BACKUP_FILE_PATH);
    process.exit(1);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('RECALCULATION COMPLETE');
console.log('='.repeat(60));
console.log(`Levels updated: ${levelsUpdated}`);
console.log(`Stages: ${Object.keys(stats.stages).length} (no changes needed)`);
console.log(`\nBackup saved at: ${BACKUP_FILE_PATH}`);
console.log('='.repeat(60));

