#!/usr/bin/env node

/**
 * Script to remove bestDirection and lastDirection fields from stage entries
 * These fields don't make sense for stages since stages are composed of levels
 * which each have their own directions.
 */

const fs = require('fs');
const path = require('path');

const statsPath = path.join(__dirname, '..', 'data', 'historical-stats.json');
const backupPath = path.join(__dirname, '..', 'data', 'historical-stats.backup-stage-cleanup.json');

console.log('Loading historical-stats.json...');
const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));

// Create backup
console.log('Creating backup...');
fs.writeFileSync(backupPath, JSON.stringify(stats, null, 2));

let stagesModified = 0;

// Remove direction fields from all stages
for (const stageName in stats.stages) {
    const stage = stats.stages[stageName];
    let modified = false;
    
    if ('bestDirection' in stage) {
        delete stage.bestDirection;
        modified = true;
    }
    
    if ('lastDirection' in stage) {
        delete stage.lastDirection;
        modified = true;
    }
    
    if (modified) {
        stagesModified++;
    }
}

// Save updated stats
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

console.log('\nCleanup complete!');
console.log(`Stages modified: ${stagesModified}`);
console.log(`Backup saved to: ${backupPath}`);

