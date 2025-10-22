#!/usr/bin/env node

/**
 * Migration script to add all-time best tracking to existing historical stats
 * This script initializes allTimeBestTime and allTimeBestDirection from current completions
 */

const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(__dirname, '..', 'data', 'historical-stats.json');
const BACKUP_FILE = path.join(__dirname, '..', 'data', 'historical-stats.backup-alltime.json');

console.log('='.repeat(60));
console.log('Migration: Add All-Time Best Tracking');
console.log('='.repeat(60));

// Load current stats
let stats;
try {
    const rawData = fs.readFileSync(STATS_FILE, 'utf8');
    stats = JSON.parse(rawData);
    console.log('✓ Loaded historical stats');
} catch (error) {
    console.error('✗ Error loading stats:', error.message);
    process.exit(1);
}

// Create backup
try {
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(stats, null, 2));
    console.log(`✓ Created backup: ${BACKUP_FILE}`);
} catch (error) {
    console.error('✗ Error creating backup:', error.message);
    process.exit(1);
}

// Migrate levels
let updatedCount = 0;
let skippedCount = 0;

Object.entries(stats.levels || {}).forEach(([levelName, levelStats]) => {
    // Skip if already has all-time best
    if (levelStats.allTimeBestTime !== undefined) {
        skippedCount++;
        return;
    }
    
    const completions = levelStats.completions || [];
    if (completions.length === 0) {
        // No completions, set to null
        levelStats.allTimeBestTime = null;
        levelStats.allTimeBestDirection = null;
        updatedCount++;
        return;
    }
    
    // Find best from current completions
    const durations = completions.map(c => typeof c === 'number' ? c : c.duration);
    const bestDuration = Math.min(...durations);
    const bestIndex = durations.indexOf(bestDuration);
    const bestCompletion = completions[bestIndex];
    const bestDirection = typeof bestCompletion === 'object' ? bestCompletion.direction : 'up';
    
    levelStats.allTimeBestTime = bestDuration;
    levelStats.allTimeBestDirection = bestDirection;
    
    updatedCount++;
    console.log(`  ${levelName}: ${(bestDuration / 1000).toFixed(1)}s (${bestDirection})`);
});

console.log('\n' + '='.repeat(60));
console.log(`Migration Results:`);
console.log(`  Updated: ${updatedCount} levels`);
console.log(`  Skipped: ${skippedCount} levels (already migrated)`);
console.log('='.repeat(60));

// Save migrated stats
try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    console.log('✓ Saved migrated stats');
} catch (error) {
    console.error('✗ Error saving stats:', error.message);
    process.exit(1);
}

console.log('\n✅ Migration complete!');
console.log(`Backup saved to: ${BACKUP_FILE}`);

