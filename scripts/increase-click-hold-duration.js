const fs = require('fs');
const path = require('path');

/**
 * Script to increase all blueBoxClickHoldDuration values by 10%
 * Adds a comment field with the original value for easy restoration
 */

const settingsPath = path.join(__dirname, '..', 'data', 'levelSettings.json');
const backupPath = path.join(__dirname, '..', 'data', 'levelSettings.backup-before-clickhold-increase.json');

// Read the settings file
console.log('Reading levelSettings.json...');
const settingsContent = fs.readFileSync(settingsPath, 'utf8');
const settings = JSON.parse(settingsContent);

// Create backup
console.log('Creating backup...');
fs.writeFileSync(backupPath, settingsContent, 'utf8');
console.log(`Backup created at: ${backupPath}`);

let updateCount = 0;

// Function to update blueBoxClickHoldDuration in an object
function updateClickHoldDuration(obj, path = '') {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        return;
    }
    
    if ('blueBoxClickHoldDuration' in obj) {
        // If original value comment exists, use that; otherwise use current value
        const originalValue = obj._blueBoxClickHoldDuration_original || obj.blueBoxClickHoldDuration;
        const newValue = Math.round(originalValue * 1.1); // Increase by 10%
        
        // Add comment field with original value (only if not already present)
        if (!obj._blueBoxClickHoldDuration_original) {
            obj._blueBoxClickHoldDuration_original = originalValue;
        }
        
        // Update the value
        obj.blueBoxClickHoldDuration = newValue;
        
        updateCount++;
        console.log(`Updated ${path || 'root'}: ${originalValue} -> ${newValue} (original: ${originalValue})`);
    }
    
    // Recursively process all properties
    for (const key in obj) {
        // Skip comment fields (but not _defaults or _comment)
        if (key.startsWith('_') && key !== '_defaults' && key !== '_comment') continue;
        const newPath = path ? `${path}.${key}` : key;
        updateClickHoldDuration(obj[key], newPath);
    }
}

// Update all blueBoxClickHoldDuration values
console.log('\nUpdating blueBoxClickHoldDuration values...');
updateClickHoldDuration(settings);

// Write the updated settings back
console.log(`\nWriting updated settings (${updateCount} values updated)...`);
const updatedContent = JSON.stringify(settings, null, 2);
fs.writeFileSync(settingsPath, updatedContent, 'utf8');

console.log('\nDone! All blueBoxClickHoldDuration values have been increased by 10%.');
console.log('Original values are stored in _blueBoxClickHoldDuration_original fields.');
console.log(`Total updates: ${updateCount}`);

