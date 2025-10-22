/**
 * Migration script to convert allTimeBestTime/allTimeBestDirection
 * to allTimeBestTimeUp and allTimeBestTimeDown
 */

const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(__dirname, '..', 'data', 'historical-stats.json');
const BACKUP_FILE = path.join(__dirname, '..', 'data', 'historical-stats.backup-alltime-directions.json');

console.log('Starting migration: allTimeBest to direction-specific fields...');

// Load current stats
let stats;
try {
    const fileContent = fs.readFileSync(STATS_FILE, 'utf8');
    stats = JSON.parse(fileContent);
} catch (error) {
    console.error('Error loading stats file:', error);
    process.exit(1);
}

// Create backup
try {
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(stats, null, 2), 'utf8');
    console.log('✓ Backup created:', BACKUP_FILE);
} catch (error) {
    console.error('Error creating backup:', error);
    process.exit(1);
}

// Migrate each level
let migratedCount = 0;
let skippedCount = 0;

Object.entries(stats.levels).forEach(([levelName, levelStats]) => {
    const oldBestTime = levelStats.allTimeBestTime;
    const oldBestDirection = levelStats.allTimeBestDirection;
    
    // Initialize new fields
    if (!levelStats.hasOwnProperty('allTimeBestTimeUp')) {
        levelStats.allTimeBestTimeUp = null;
    }
    if (!levelStats.hasOwnProperty('allTimeBestTimeDown')) {
        levelStats.allTimeBestTimeDown = null;
    }
    
    // Migrate old data if it exists
    if (oldBestTime !== null && oldBestTime !== undefined) {
        if (oldBestDirection === 'up' || !oldBestDirection) {
            // Default to 'up' if no direction specified
            levelStats.allTimeBestTimeUp = oldBestTime;
        } else if (oldBestDirection === 'down') {
            levelStats.allTimeBestTimeDown = oldBestTime;
        }
        
        // Remove old fields
        delete levelStats.allTimeBestTime;
        delete levelStats.allTimeBestDirection;
        
        migratedCount++;
        console.log(`  ✓ Migrated "${levelName}": ${oldBestTime}ms (${oldBestDirection || 'up'})`);
    } else {
        skippedCount++;
    }
});

// Save migrated stats
try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
    console.log('\n✓ Migration complete!');
    console.log(`  - Migrated: ${migratedCount} levels`);
    console.log(`  - Skipped: ${skippedCount} levels (no data)`);
} catch (error) {
    console.error('Error saving migrated stats:', error);
    process.exit(1);
}

