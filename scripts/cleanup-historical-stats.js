#!/usr/bin/env node
/**
 * cleanup-historical-stats.js
 * 
 * This script cleans up the historical-stats.json file by:
 * 1. Removing the "Level 1" entry entirely (placeholder name, not a real level)
 * 2. Removing consecutive duplicate entries
 * 3. Trimming each level/stage to the last 5 completions
 * 4. Recalculating stats
 */

const fs = require('fs');
const path = require('path');

const STATS_FILE_PATH = path.join(__dirname, '..', 'data', 'historical-stats.json');
const BACKUP_FILE_PATH = path.join(__dirname, '..', 'data', 'historical-stats.backup.json');

// Calculate stats from completions array
function calculateStats(completions) {
    if (!completions || completions.length === 0) {
        return {
            completions: [],
            averageDuration: 0,
            totalCompletions: 0,
            bestTime: 0,
            worstTime: 0,
            lastTime: 0
        };
    }

    const sum = completions.reduce((acc, time) => acc + time, 0);
    const avg = Math.round(sum / completions.length);
    const best = Math.min(...completions);
    const worst = Math.max(...completions);
    const last = completions[completions.length - 1];

    return {
        completions,
        averageDuration: avg,
        totalCompletions: completions.length,
        bestTime: best,
        worstTime: worst,
        lastTime: last
    };
}

// Remove consecutive duplicates from array
function removeDuplicates(arr) {
    if (!arr || arr.length === 0) return [];
    
    const result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] !== arr[i - 1]) {
            result.push(arr[i]);
        }
    }
    return result;
}

// Main cleanup function
function cleanupHistoricalStats() {
    console.log('Reading historical stats file...');
    
    // Read the file
    let stats;
    try {
        const fileContent = fs.readFileSync(STATS_FILE_PATH, 'utf8');
        stats = JSON.parse(fileContent);
    } catch (error) {
        console.error('Error reading historical stats file:', error.message);
        process.exit(1);
    }

    console.log('Creating backup...');
    // Create backup
    try {
        fs.copyFileSync(STATS_FILE_PATH, BACKUP_FILE_PATH);
        console.log(`Backup created at: ${BACKUP_FILE_PATH}`);
    } catch (error) {
        console.error('Error creating backup:', error.message);
        process.exit(1);
    }

    // Track changes
    let totalLevels = 0;
    let cleanedLevelsCount = 0;
    let removedDuplicates = 0;
    let trimmedEntries = 0;

    // Clean up levels
    console.log('\nCleaning up levels...');
    const cleanedLevels = {};
    
    for (const [levelName, levelData] of Object.entries(stats.levels || {})) {
        totalLevels++;
        
        // Skip "Level 1" entirely
        if (levelName === 'Level 1') {
            console.log(`  ✗ Removing "${levelName}" (placeholder, not a real level)`);
            continue;
        }
        
        const originalCount = levelData.completions.length;
        
        // Remove consecutive duplicates
        let completions = removeDuplicates(levelData.completions);
        const duplicatesRemoved = originalCount - completions.length;
        if (duplicatesRemoved > 0) {
            removedDuplicates += duplicatesRemoved;
            console.log(`  - "${levelName}": removed ${duplicatesRemoved} duplicate(s)`);
        }
        
        // Trim to last 5
        const beforeTrim = completions.length;
        if (completions.length > 5) {
            completions = completions.slice(-5);
            const entriesTrimmed = beforeTrim - 5;
            trimmedEntries += entriesTrimmed;
            console.log(`  - "${levelName}": trimmed ${entriesTrimmed} old entry(ies), kept last 5`);
        }
        
        // Recalculate stats
        cleanedLevels[levelName] = calculateStats(completions);
        cleanedLevelsCount++;
    }

    // Clean up stages
    console.log('\nCleaning up stages...');
    const cleanedStages = {};
    
    for (const [stageName, stageData] of Object.entries(stats.stages || {})) {
        const originalCount = stageData.completions.length;
        
        // Remove consecutive duplicates
        let completions = removeDuplicates(stageData.completions);
        const duplicatesRemoved = originalCount - completions.length;
        if (duplicatesRemoved > 0) {
            console.log(`  - "${stageName}": removed ${duplicatesRemoved} duplicate(s)`);
        }
        
        // Trim to last 5
        const beforeTrim = completions.length;
        if (completions.length > 5) {
            completions = completions.slice(-5);
            console.log(`  - "${stageName}": trimmed ${beforeTrim - 5} old entry(ies), kept last 5`);
        }
        
        // Recalculate stats
        cleanedStages[stageName] = calculateStats(completions);
    }

    // Create cleaned stats object
    const cleanedStats = {
        levels: cleanedLevels,
        stages: cleanedStages,
        metadata: {
            lastUpdated: Date.now(),
            totalLevelsTracked: Object.keys(cleanedLevels).length,
            totalStagesTracked: Object.keys(cleanedStages).length
        }
    };

    // Write cleaned data back
    console.log('\nWriting cleaned data...');
    try {
        fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(cleanedStats, null, 2), 'utf8');
        console.log(`Cleaned data written to: ${STATS_FILE_PATH}`);
    } catch (error) {
        console.error('Error writing cleaned data:', error.message);
        process.exit(1);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total levels processed:      ${totalLevels}`);
    console.log(`Levels kept:                 ${cleanedLevelsCount}`);
    console.log(`Levels removed:              ${totalLevels - cleanedLevelsCount} (Level 1)`);
    console.log(`Duplicate entries removed:   ${removedDuplicates}`);
    console.log(`Old entries trimmed:         ${trimmedEntries}`);
    console.log('='.repeat(60));
    console.log('\n✓ Cleanup complete!');
    console.log(`  Backup saved at: ${BACKUP_FILE_PATH}`);
}

// Run cleanup
try {
    cleanupHistoricalStats();
} catch (error) {
    console.error('\nError during cleanup:', error.message);
    console.error(error.stack);
    process.exit(1);
}

