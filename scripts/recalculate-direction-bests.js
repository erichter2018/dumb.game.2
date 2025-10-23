#!/usr/bin/env node

/**
 * Script to recalculate all-time best times from the separate direction arrays
 */

const fs = require('fs');
const path = require('path');

const statsPath = path.join(__dirname, '..', 'data', 'historical-stats.json');
const backupPath = path.join(__dirname, '..', 'data', 'historical-stats.backup-recalc-direction-bests.json');

console.log('Loading historical-stats.json...');
const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));

// Create backup
console.log('Creating backup...');
fs.writeFileSync(backupPath, JSON.stringify(stats, null, 2));

let levelsUpdated = 0;

console.log('\nRecalculating all-time bests from direction arrays...');

for (const levelName in stats.levels) {
    const level = stats.levels[levelName];
    
    let updated = false;
    
    // Recalculate best for 'up' direction
    if (level.completionsUp && level.completionsUp.length > 0) {
        const bestUp = Math.min(...level.completionsUp);
        if (level.allTimeBestTimeUp === null || bestUp < level.allTimeBestTimeUp) {
            console.log(`  ${levelName}: Setting allTimeBestTimeUp to ${bestUp}ms`);
            level.allTimeBestTimeUp = bestUp;
            updated = true;
        }
    }
    
    // Recalculate best for 'down' direction
    if (level.completionsDown && level.completionsDown.length > 0) {
        const bestDown = Math.min(...level.completionsDown);
        if (level.allTimeBestTimeDown === null || bestDown < level.allTimeBestTimeDown) {
            console.log(`  ${levelName}: Setting allTimeBestTimeDown to ${bestDown}ms`);
            level.allTimeBestTimeDown = bestDown;
            updated = true;
        }
    }
    
    if (updated) {
        levelsUpdated++;
    }
}

// Save updated stats
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

console.log('\n✅ Recalculation complete!');
console.log(`Levels updated: ${levelsUpdated}`);
console.log(`Backup saved to: ${backupPath}`);

