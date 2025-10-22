const fs = require('fs');
const path = require('path');

/**
 * Migration script to convert levelSettings.json to direction-based structure
 * 
 * Old structure:
 *   levels: {
 *     "cafe": {
 *       scrollDirection: "up",
 *       perfectStartingPosition: "scroll_down_1x",
 *       scrollToBottomAfterFirstBuild: false,
 *       ...
 *     }
 *   }
 * 
 * New structure:
 *   levels: {
 *     "cafe": {
 *       doResearch: true,
 *       blueBoxClickHoldDuration: 4500,
 *       maxBuildTimeMs: 180000,
 *       scrollDirection: "up",  // current active direction
 *       directionUp: {
 *         perfectStartingPosition: "scroll_down_1x",
 *         scrollToBottomAfterFirstBuild: false,
 *         scrollToBottomAfterSecondBuild: false,
 *         firstBuildAction: {...},
 *         secondBuildAction: {...}
 *       },
 *       directionDown: {
 *         // Default settings for down direction
 *         perfectStartingPosition: "nothing",
 *         scrollToBottomAfterFirstBuild: true,
 *         scrollToBottomAfterSecondBuild: false,
 *         firstBuildAction: {...},
 *         secondBuildAction: {...}
 *       }
 *     }
 *   }
 */

const settingsPath = path.join(__dirname, '..', 'data', 'levelSettings.json');
const backupPath = path.join(__dirname, '..', 'data', 'levelSettings.backup.json');

// Direction-specific setting keys
const directionSpecificKeys = [
  'perfectStartingPosition',
  'scrollToBottomAfterFirstBuild',
  'scrollToBottomAfterSecondBuild',
  'firstBuildAction',
  'secondBuildAction'
];

// Global setting keys (not direction-specific)
const globalKeys = [
  'doResearch',
  'scrollDirection',
  'blueBoxClickHoldDuration',
  'maxBuildTimeMs'
];

function migrateSettings() {
  console.log('Starting settings migration...');
  
  // Read current settings
  const rawData = fs.readFileSync(settingsPath, 'utf8');
  const data = JSON.parse(rawData);
  
  // Create backup
  fs.writeFileSync(backupPath, rawData, 'utf8');
  console.log(`Backup created at ${backupPath}`);
  
  // Migrate defaults
  const newDefaults = {
    ...data._defaults
  };
  
  // Migrate each level
  const newLevels = {};
  
  for (const [levelName, settings] of Object.entries(data.levels)) {
    console.log(`Migrating ${levelName}...`);
    
    const currentDirection = settings.scrollDirection || 'up';
    
    // Separate global and direction-specific settings
    const globalSettings = {};
    const directionSettings = {};
    
    for (const [key, value] of Object.entries(settings)) {
      if (globalKeys.includes(key)) {
        globalSettings[key] = value;
      } else if (directionSpecificKeys.includes(key)) {
        directionSettings[key] = value;
      }
    }
    
    // Create direction-specific objects
    const directionUp = {};
    const directionDown = {};
    
    // Populate the current direction with existing settings
    const currentDirectionObj = currentDirection === 'up' ? directionUp : directionDown;
    Object.assign(currentDirectionObj, directionSettings);
    
    // Populate the other direction with defaults
    const otherDirectionObj = currentDirection === 'up' ? directionDown : directionUp;
    otherDirectionObj.perfectStartingPosition = data._defaults.perfectStartingPosition || 'nothing';
    otherDirectionObj.scrollToBottomAfterFirstBuild = data._defaults.scrollToBottomAfterFirstBuild !== undefined 
      ? data._defaults.scrollToBottomAfterFirstBuild 
      : true;
    otherDirectionObj.scrollToBottomAfterSecondBuild = data._defaults.scrollToBottomAfterSecondBuild !== undefined
      ? data._defaults.scrollToBottomAfterSecondBuild
      : false;
    otherDirectionObj.firstBuildAction = data._defaults.firstBuildAction || {
      action: 'nothing',
      triggerTimeMs: null,
      clickOffAndScrollDistance: 150,
      clickaroundOptions: {}
    };
    otherDirectionObj.secondBuildAction = data._defaults.secondBuildAction || {
      action: 'nothing',
      triggerTimeMs: null,
      clickOffAndScrollDistance: 150,
      clickaroundOptions: {}
    };
    
    // Build new level object
    newLevels[levelName] = {
      ...globalSettings,
      directionUp,
      directionDown
    };
  }
  
  // Create new settings object
  const newData = {
    _comment: data._comment,
    _defaults: newDefaults,
    levels: newLevels
  };
  
  // Write new settings
  fs.writeFileSync(settingsPath, JSON.stringify(newData, null, 2), 'utf8');
  console.log('Migration complete!');
  console.log(`New settings written to ${settingsPath}`);
  console.log(`Backup available at ${backupPath}`);
}

// Run migration
try {
  migrateSettings();
  console.log('\n✅ Migration successful!');
} catch (error) {
  console.error('\n❌ Migration failed:', error);
  console.error('Your original settings are safe. Backup was created before any changes.');
  process.exit(1);
}


