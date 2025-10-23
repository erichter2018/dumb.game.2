#!/usr/bin/env node

/**
 * Script to migrate historical-stats.json to separate direction arrays
 * Changes from single 'completions' array to 'completionsUp' and 'completionsDown' arrays
 */

const fs = require('fs');
const path = require('path');

const statsPath = path.join(__dirname, '..', 'data', 'historical-stats.json');
const backupPath = path.join(__dirname, '..', 'data', 'historical-stats.backup-separate-directions.json');

console.log('Loading historical-stats.json...');
const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));

// Create backup
console.log('Creating backup...');
fs.writeFileSync(backupPath, JSON.stringify(stats, null, 2));

let levelsModified = 0;
let levelsSkipped = 0;

console.log('\nMigrating levels to separate direction arrays...');

for (const levelName in stats.levels) {
    const level = stats.levels[levelName];
    
    // Check if already migrated
    if (level.completionsUp !== undefined || level.completionsDown !== undefined) {
        console.log(`  Skipping "${levelName}" - already has separate arrays`);
        levelsSkipped++;
        continue;
    }
    
    // Check if has old completions array
    if (!level.completions || !Array.isArray(level.completions)) {
        console.log(`  Skipping "${levelName}" - no completions array found`);
        levelsSkipped++;
        continue;
    }
    
    // Separate completions by direction
    const completionsUp = [];
    const completionsDown = [];
    
    for (const completion of level.completions) {
        if (typeof completion === 'object' && completion.duration !== undefined) {
            // New format with direction
            const duration = completion.duration;
            const direction = completion.direction || 'up';
            
            if (direction === 'up') {
                completionsUp.push(duration);
            } else if (direction === 'down') {
                completionsDown.push(duration);
            }
        } else if (typeof completion === 'number') {
            // Old format - assume 'up'
            completionsUp.push(completion);
        }
    }
    
    // Keep only last 5 for each direction
    if (completionsUp.length > 5) {
        completionsUp.splice(0, completionsUp.length - 5);
    }
    if (completionsDown.length > 5) {
        completionsDown.splice(0, completionsDown.length - 5);
    }
    
    // Update level with new arrays
    level.completionsUp = completionsUp;
    level.completionsDown = completionsDown;
    
    // Remove old completions array
    delete level.completions;
    
    console.log(`  Migrated "${levelName}": ${completionsUp.length} up, ${completionsDown.length} down`);
    levelsModified++;
}

// Save updated stats
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

console.log('\n✅ Migration complete!');
console.log(`Levels migrated: ${levelsModified}`);
console.log(`Levels skipped: ${levelsSkipped}`);
console.log(`Backup saved to: ${backupPath}`);

