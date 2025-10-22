#!/usr/bin/env node
/**
 * Migration Script: Add Direction to Historical Stats
 * 
 * This script migrates the historical stats to include direction information.
 * All existing completions are assumed to be "up" direction.
 * 
 * Old format: completions: [duration1, duration2, ...]
 * New format: completions: [{duration: X, direction: "up"}, {duration: Y, direction: "down"}, ...]
 */

const fs = require('fs');
const path = require('path');

const STATS_FILE_PATH = path.join(__dirname, '..', 'data', 'historical-stats.json');
const BACKUP_FILE_PATH = path.join(__dirname, '..', 'data', 'historical-stats.backup-pre-direction.json');

console.log('='.repeat(60));
console.log('MIGRATION: Adding Direction to Historical Stats');
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

// Check if migration is needed
function needsMigration(completions) {
    if (!completions || completions.length === 0) return false;
    // If first completion is a number, needs migration
    return typeof completions[0] === 'number';
}

// Migrate levels
let levelsModified = 0;
let levelsSkipped = 0;

console.log('\nMigrating levels...');
for (const [levelName, levelStats] of Object.entries(stats.levels)) {
    if (needsMigration(levelStats.completions)) {
        // Convert each completion from number to object
        levelStats.completions = levelStats.completions.map(duration => ({
            duration: duration,
            direction: 'up'  // Assume all existing completions were "up"
        }));
        
        levelsModified++;
        console.log(`  ✓ ${levelName}: Migrated ${levelStats.completions.length} completions to "up"`);
    } else {
        levelsSkipped++;
        console.log(`  - ${levelName}: Already migrated, skipping`);
    }
}

// Migrate stages (they don't need direction tracking, but we'll update the structure for consistency)
let stagesModified = 0;
let stagesSkipped = 0;

console.log('\nMigrating stages...');
for (const [stageName, stageStats] of Object.entries(stats.stages)) {
    // Stages don't track direction, so we just ensure they're in array format
    // (they should already be)
    if (needsMigration(stageStats.completions)) {
        // Keep stages as simple numbers (no direction needed for full stage times)
        stagesSkipped++;
        console.log(`  - ${stageName}: Keeping as numeric array`);
    } else {
        stagesSkipped++;
    }
}

// Save the migrated stats
try {
    stats.metadata.lastUpdated = new Date().toISOString();
    stats.metadata.migrationHistory = stats.metadata.migrationHistory || [];
    stats.metadata.migrationHistory.push({
        date: new Date().toISOString(),
        type: 'add-direction',
        levelsModified: levelsModified,
        levelsSkipped: levelsSkipped
    });
    
    fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(stats, null, 2), 'utf8');
    console.log('\n✓ Successfully saved migrated stats');
} catch (error) {
    console.error('\n✗ Failed to save migrated stats:', error.message);
    console.error('   You can restore from backup at:', BACKUP_FILE_PATH);
    process.exit(1);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('MIGRATION COMPLETE');
console.log('='.repeat(60));
console.log(`Levels modified: ${levelsModified}`);
console.log(`Levels skipped: ${levelsSkipped}`);
console.log(`Stages: ${Object.keys(stats.stages).length} (no migration needed)`);
console.log(`\nBackup saved at: ${BACKUP_FILE_PATH}`);
console.log('='.repeat(60));

