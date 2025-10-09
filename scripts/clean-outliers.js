const fs = require('fs');

const data = JSON.parse(fs.readFileSync('../data/historical-stats.json', 'utf8'));

console.log('\n=== CLEANING OUTLIERS FROM DATABASE ===\n');

// Define outliers to remove (in milliseconds)
const outliersToRemove = {
    'Big Drive Thru': [969355, 114224], // Both extremes look wrong
    'Dango Stand': [281321], // Way too high
    'Italiano': [929927], // Way too high
    'Cheese Shop': [338561], // Way too high
    'Ramen Truck': [230053], // First completion, too high
    'Lobster House': [391019, 382477, 383643], // Early runs, too high
    'Kebab Shop': [208203], // First completion, too high
    'Sushi Bar': [204076], // Too high
    'Mezze Bar': [619612] // Too high
};

let totalRemoved = 0;

Object.entries(outliersToRemove).forEach(([levelName, outlierValues]) => {
    if (!data.levels[levelName]) {
        console.log(`⚠️  Level "${levelName}" not found in database`);
        return;
    }
    
    const originalCount = data.levels[levelName].completions.length;
    const originalAvg = data.levels[levelName].averageDuration;
    
    // Remove outliers
    outlierValues.forEach(outlierValue => {
        const index = data.levels[levelName].completions.indexOf(outlierValue);
        if (index > -1) {
            data.levels[levelName].completions.splice(index, 1);
            totalRemoved++;
        }
    });
    
    const newCount = data.levels[levelName].completions.length;
    
    if (newCount !== originalCount) {
        // Recalculate statistics
        const completions = data.levels[levelName].completions;
        
        if (completions.length > 0) {
            const sum = completions.reduce((acc, val) => acc + val, 0);
            data.levels[levelName].averageDuration = Math.round(sum / completions.length);
            data.levels[levelName].totalCompletions = completions.length;
            data.levels[levelName].bestTime = Math.min(...completions);
            data.levels[levelName].worstTime = Math.max(...completions);
            
            const removedCount = originalCount - newCount;
            const newAvg = data.levels[levelName].averageDuration;
            const avgChange = Math.round((originalAvg - newAvg) / 1000);
            
            console.log(`✅ ${levelName}: Removed ${removedCount} outlier(s)`);
            console.log(`   Old avg: ${Math.round(originalAvg/1000)}s → New avg: ${Math.round(newAvg/1000)}s (${avgChange > 0 ? '-' : '+'}${Math.abs(avgChange)}s)`);
            console.log(`   Completions: ${originalCount} → ${newCount}`);
        } else {
            console.log(`❌ ${levelName}: All completions were outliers! Keeping original data.`);
            // Restore original data
            outlierValues.forEach(val => data.levels[levelName].completions.push(val));
        }
    }
});

console.log(`\n📊 Summary: Removed ${totalRemoved} outlier times from ${Object.keys(outliersToRemove).length} levels`);

// Update metadata
data.metadata.lastUpdated = new Date().toISOString();

// Backup original file
const backupPath = '../data/historical-stats.backup.json';
fs.copyFileSync('../data/historical-stats.json', backupPath);
console.log(`\n💾 Backup saved to: ${backupPath}`);

// Save cleaned data
fs.writeFileSync('../data/historical-stats.json', JSON.stringify(data, null, 2));
console.log(`✨ Cleaned database saved to: ../data/historical-stats.json\n`);


