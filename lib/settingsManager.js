const fs = require('fs');
const path = require('path');

/**
 * Settings Manager - Manages level-specific automation settings
 * Loads settings from levelSettings.json and provides methods to get settings for specific levels
 */

class SettingsManager {
    constructor() {
        this.settingsPath = path.join(__dirname, '..', 'data', 'levelSettings.json');
        this.settings = null;
        this.defaults = null;
        this.loadSettings();
    }

    /**
     * Load settings from JSON file
     */
    loadSettings() {
        try {
            const rawData = fs.readFileSync(this.settingsPath, 'utf8');
            const data = JSON.parse(rawData);
            this.defaults = data._defaults || {};
            if (!this.defaults.directionMode) {
                this.defaults.directionMode = 'random';
            }
            this.settings = data.levels || {};
            console.log('Settings loaded successfully from', this.settingsPath);
        } catch (error) {
            console.error('Error loading settings:', error);
            // Use fallback defaults if file doesn't exist or is invalid
            this.defaults = {
                doResearch: true,
                scrollDirection: 'up',
                directionMode: 'random',
                blueBoxClickHoldDuration: 4500,
                optimized: true, // Default for 'up' direction
                scrollAfterFirstBuild: {
                    action: 'scrollToBottom',  // Old default was true
                    direction: 'down',
                    distance: 300
                },
                scrollAfterSecondBuild: {
                    action: 'nothing',  // Old default was false
                    direction: 'down',
                    distance: 300
                },
                perfectStartingPosition: {
                    action: 'nothing',
                    waitTimeMs: null
                },
                firstBuildAction: {
                    action: 'nothing',
                    triggerTimeMs: null,
                    clickOffAndScrollDistance: 150,
                    clickOffAndScrollDirection: 'down',  // New: explicit direction
                    clickaroundOptions: {
                        excludeRedBlobs: true,
                        clickaroundChunks: 3,
                        scrollUpDistance: 200,
                        scrollUpCount: 5,
                        initialScrollDown: 150,
                        scrollToBottomAtEnd: false
                    }
                },
                secondBuildAction: {
                    action: 'nothing',
                    triggerTimeMs: null,
                    clickOffAndScrollDistance: 150,
                    clickOffAndScrollDirection: 'down',  // New: explicit direction
                    clickaroundOptions: {
                        excludeRedBlobs: true,
                        clickaroundChunks: 3,
                        scrollUpDistance: 200,
                        scrollUpCount: 5,
                        initialScrollDown: 150,
                        scrollToBottomAtEnd: false
                    }
                },
                customTriggers: []
            };
            this.settings = {};
        }
    }

    /**
     * Reload settings from file (useful if settings are updated while app is running)
     */
    reloadSettings() {
        this.loadSettings();
    }

    /**
     * Save settings back to file
     */
    saveSettings() {
        try {
            const data = {
                _comment: 'Level-specific settings for game automation. Each level can have custom behaviors.',
                _defaults: this.defaults,
                levels: this.settings
            };
            fs.writeFileSync(this.settingsPath, JSON.stringify(data, null, 2), 'utf8');
            console.log('Settings saved successfully to', this.settingsPath);
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    /**
     * Normalize level name for lookup (case-insensitive, trimmed)
     */
    normalizeLevelName(levelName) {
        if (!levelName) return '';
        return levelName.toLowerCase().trim();
    }

    /**
     * Get settings for a specific level (merged with defaults)
     * @param {string} levelName - The name of the level
     * @returns {object} Complete settings object for the level
     */
    getLevelSettings(levelName) {
        const normalizedName = this.normalizeLevelName(levelName);
        
        // Get level-specific settings (if they exist)
        const levelSettings = this.settings[normalizedName] || {};
        
        // Determine current scroll direction
        const scrollDirection = levelSettings.scrollDirection || this.defaults.scrollDirection || 'up';
        
        // Get direction-specific settings
        const directionKey = scrollDirection === 'up' ? 'directionUp' : 'directionDown';
        const directionSettings = levelSettings[directionKey] || {};
        
        // Extract global settings (non-direction-specific)
        const globalSettings = {
            doResearch: levelSettings.doResearch !== undefined ? levelSettings.doResearch : this.defaults.doResearch,
            scrollDirection: scrollDirection,
            blueBoxClickHoldDuration: levelSettings.blueBoxClickHoldDuration !== undefined 
                ? levelSettings.blueBoxClickHoldDuration 
                : this.defaults.blueBoxClickHoldDuration,
            maxBuildTimeMs: levelSettings.maxBuildTimeMs !== undefined
                ? levelSettings.maxBuildTimeMs
                : this.defaults.maxBuildTimeMs
        };
        
        // Merge with defaults and direction-specific settings
        const merged = {
            ...this.defaults,
            ...globalSettings,
            ...directionSettings,
            // Handle nested objects specially
            perfectStartingPosition: typeof directionSettings.perfectStartingPosition === 'object' 
                ? {
                    ...this.defaults.perfectStartingPosition,
                    ...directionSettings.perfectStartingPosition
                }
                : (directionSettings.perfectStartingPosition 
                    ? { action: directionSettings.perfectStartingPosition, waitTimeMs: null } // Backward compatibility
                    : this.defaults.perfectStartingPosition),
            firstBuildAction: {
                ...this.defaults.firstBuildAction,
                ...(directionSettings.firstBuildAction || {})
            },
            secondBuildAction: {
                ...this.defaults.secondBuildAction,
                ...(directionSettings.secondBuildAction || {})
            },
            // Include customTriggers from level settings
            customTriggers: levelSettings.customTriggers || [],
            // Include minBuildCount (top-level property for tracking minimum builds to complete level)
            minBuildCount: levelSettings.minBuildCount || null
        };
        
        return merged;
    }

    /**
     * Update settings for a specific level
     * @param {string} levelName - The name of the level
     * @param {object} newSettings - Settings to update (partial or complete)
     */
    updateLevelSettings(levelName, newSettings) {
        const normalizedName = this.normalizeLevelName(levelName);
        
        if (!this.settings[normalizedName]) {
            this.settings[normalizedName] = {};
        }
        
        // Merge new settings with existing settings for this level
        this.settings[normalizedName] = {
            ...this.settings[normalizedName],
            ...newSettings
        };
        
        console.log(`Updated settings for level "${levelName}":`, this.settings[normalizedName]);
    }

    /**
     * Get all level names that have custom settings
     * @returns {string[]} Array of level names
     */
    getAllLevelNames() {
        return Object.keys(this.settings);
    }

    /**
     * Check if a level has any custom settings
     * @param {string} levelName - The name of the level
     * @returns {boolean} True if level has custom settings
     */
    hasCustomSettings(levelName) {
        const normalizedName = this.normalizeLevelName(levelName);
        return this.settings.hasOwnProperty(normalizedName);
    }

    /**
     * Get default settings
     * @returns {object} Default settings object
     */
    getDefaults() {
        return { ...this.defaults };
    }

    /**
     * Update default settings
     * @param {object} newDefaults - New default settings (partial or complete)
     */
    updateDefaults(newDefaults) {
        this.defaults = {
            ...this.defaults,
            ...newDefaults
        };
        console.log('Updated default settings:', this.defaults);
    }

    // Global directionMode helpers (stored under _global in levels map)
    getDirectionMode() {
        const global = this.settings._global || {};
        return global.directionMode || this.defaults.directionMode || 'random';
    }

    setDirectionMode(mode) {
        if (!this.settings._global) this.settings._global = {};
        this.settings._global.directionMode = mode;
    }

    /**
     * Get all settings (for export/display)
     * @returns {object} All settings including defaults
     */
    getAllSettings() {
        return {
            defaults: this.defaults,
            levels: this.settings
        };
    }

    /**
     * Update direction-specific settings for a level
     * @param {string} levelName - The name of the level
     * @param {string} direction - 'up' or 'down'
     * @param {object} directionSettings - Settings specific to this direction
     */
    updateDirectionSettings(levelName, direction, directionSettings) {
        const normalizedName = this.normalizeLevelName(levelName);
        
        if (!this.settings[normalizedName]) {
            this.settings[normalizedName] = {
                scrollDirection: 'up',
                directionUp: {},
                directionDown: {}
            };
        }
        
        const directionKey = direction === 'up' ? 'directionUp' : 'directionDown';
        
        // Merge new direction settings
        this.settings[normalizedName][directionKey] = {
            ...this.settings[normalizedName][directionKey],
            ...directionSettings
        };
        
        console.log(`Updated ${direction} direction settings for level "${levelName}"`);
    }

    /**
     * Switch the active scroll direction for a level
     * @param {string} levelName - The name of the level
     * @param {string} newDirection - 'up' or 'down'
     */
    switchDirection(levelName, newDirection) {
        const normalizedName = this.normalizeLevelName(levelName);
        
        if (!this.settings[normalizedName]) {
            this.settings[normalizedName] = {
                scrollDirection: newDirection,
                directionUp: {},
                directionDown: {}
            };
        } else {
            this.settings[normalizedName].scrollDirection = newDirection;
        }
        
        console.log(`Switched direction for level "${levelName}" to: ${newDirection}`);
    }

    /**
     * Get direction-specific settings for a level (merged with defaults)
     * @param {string} levelName - The name of the level
     * @param {string} direction - 'up' or 'down'
     * @returns {object} Direction-specific settings merged with defaults
     */
    getDirectionSettings(levelName, direction) {
        const normalizedName = this.normalizeLevelName(levelName);
        const levelSettings = this.settings[normalizedName] || {};
        const directionKey = direction === 'up' ? 'directionUp' : 'directionDown';
        const directionSettings = levelSettings[directionKey] || {};
        
        // Handle backward compatibility for old boolean scroll settings
        const convertScrollSetting = (oldValue, defaultValue) => {
            if (typeof oldValue === 'boolean') {
                // Migrate old boolean to new structure
                return oldValue 
                    ? { action: 'scrollToBottom', direction: 'down', distance: 300 }
                    : { action: 'nothing', direction: 'down', distance: 300 };
            } else if (typeof oldValue === 'object' && oldValue !== null) {
                // New structure (and not null)
                return oldValue;
            }
            // Use default (covers undefined, null, or other types)
            return defaultValue;
        };
        
        // Merge with defaults
        const scrollFirst = convertScrollSetting(
            directionSettings.scrollAfterFirstBuild || directionSettings.scrollToBottomAfterFirstBuild,
            this.defaults.scrollAfterFirstBuild
        );
        const scrollSecond = convertScrollSetting(
            directionSettings.scrollAfterSecondBuild || directionSettings.scrollToBottomAfterSecondBuild,
            this.defaults.scrollAfterSecondBuild
        );
        
        console.log(`DEBUG [settingsManager]: getDirectionSettings("${levelName}", "${direction}")`);
        console.log(`DEBUG [settingsManager]: directionSettings keys:`, Object.keys(directionSettings));
        console.log(`DEBUG [settingsManager]: this.defaults.scrollAfterFirstBuild:`, this.defaults.scrollAfterFirstBuild);
        console.log(`DEBUG [settingsManager]: convertScrollSetting returned scrollFirst:`, scrollFirst);
        console.log(`DEBUG [settingsManager]: convertScrollSetting returned scrollSecond:`, scrollSecond);
        
        const merged = {
            optimized: directionSettings.optimized !== undefined 
                ? directionSettings.optimized 
                : (direction === 'up' ? true : false), // Default: optimized for 'up', not for 'down'
            scrollAfterFirstBuild: scrollFirst,
            scrollAfterSecondBuild: scrollSecond,
            perfectStartingPosition: typeof directionSettings.perfectStartingPosition === 'object' 
                ? {
                    ...this.defaults.perfectStartingPosition,
                    ...directionSettings.perfectStartingPosition
                }
                : (directionSettings.perfectStartingPosition 
                    ? { action: directionSettings.perfectStartingPosition, waitTimeMs: null } // Backward compatibility
                    : this.defaults.perfectStartingPosition),
            firstBuildAction: {
                ...this.defaults.firstBuildAction,
                ...(directionSettings.firstBuildAction || {}),
                // Ensure clickOffAndScrollDirection exists (backward compatibility)
                clickOffAndScrollDirection: directionSettings.firstBuildAction?.clickOffAndScrollDirection || this.defaults.firstBuildAction.clickOffAndScrollDirection,
                clickaroundOptions: {
                    ...this.defaults.firstBuildAction.clickaroundOptions,
                    ...((directionSettings.firstBuildAction && directionSettings.firstBuildAction.clickaroundOptions) || {})
                }
            },
            secondBuildAction: {
                ...this.defaults.secondBuildAction,
                ...(directionSettings.secondBuildAction || {}),
                // Ensure clickOffAndScrollDirection exists (backward compatibility)
                clickOffAndScrollDirection: directionSettings.secondBuildAction?.clickOffAndScrollDirection || this.defaults.secondBuildAction.clickOffAndScrollDirection,
                clickaroundOptions: {
                    ...this.defaults.secondBuildAction.clickaroundOptions,
                    ...((directionSettings.secondBuildAction && directionSettings.secondBuildAction.clickaroundOptions) || {})
                }
            }
        };
        
        return merged;
    }

    /**
     * Get custom triggers for a level and direction
     * @param {string} levelName - The name of the level
     * @param {string} direction - The direction ('up' or 'down')
     * @returns {Array} Array of custom triggers
     */
    getCustomTriggers(levelName, direction = 'up') {
        const normalizedName = this.normalizeLevelName(levelName);
        const levelSettings = this.settings[normalizedName] || {};
        
        // First check direction-specific triggers
        const directionKey = direction === 'down' ? 'directionDown' : 'directionUp';
        if (levelSettings[directionKey] && levelSettings[directionKey].customTriggers) {
            return levelSettings[directionKey].customTriggers;
        }
        
        // Fallback to top-level customTriggers for backwards compatibility
        return levelSettings.customTriggers || [];
    }

    /**
     * Add a custom trigger to a level and direction
     * @param {string} levelName - The name of the level
     * @param {object} trigger - The trigger configuration
     * @param {string} direction - The direction ('up' or 'down')
     */
    addCustomTrigger(levelName, trigger, direction = 'up') {
        const normalizedName = this.normalizeLevelName(levelName);
        if (!this.settings[normalizedName]) {
            this.settings[normalizedName] = {};
        }
        
        const directionKey = direction === 'down' ? 'directionDown' : 'directionUp';
        if (!this.settings[normalizedName][directionKey]) {
            this.settings[normalizedName][directionKey] = {};
        }
        if (!this.settings[normalizedName][directionKey].customTriggers) {
            this.settings[normalizedName][directionKey].customTriggers = [];
        }
        this.settings[normalizedName][directionKey].customTriggers.push(trigger);
        this.saveSettings();
    }

    /**
     * Update a custom trigger for a level and direction
     * @param {string} levelName - The name of the level
     * @param {number} index - The index of the trigger to update
     * @param {object} trigger - The updated trigger configuration
     * @param {string} direction - The direction ('up' or 'down')
     */
    updateCustomTrigger(levelName, index, trigger, direction = 'up') {
        const normalizedName = this.normalizeLevelName(levelName);
        const directionKey = direction === 'down' ? 'directionDown' : 'directionUp';
        
        if (this.settings[normalizedName] && 
            this.settings[normalizedName][directionKey] && 
            this.settings[normalizedName][directionKey].customTriggers) {
            this.settings[normalizedName][directionKey].customTriggers[index] = trigger;
            this.saveSettings();
        }
    }

    /**
     * Remove a custom trigger from a level and direction
     * @param {string} levelName - The name of the level
     * @param {number} index - The index of the trigger to remove
     * @param {string} direction - The direction ('up' or 'down')
     */
    removeCustomTrigger(levelName, index, direction = 'up') {
        const normalizedName = this.normalizeLevelName(levelName);
        const directionKey = direction === 'down' ? 'directionDown' : 'directionUp';
        
        if (this.settings[normalizedName] && 
            this.settings[normalizedName][directionKey] && 
            this.settings[normalizedName][directionKey].customTriggers) {
            this.settings[normalizedName][directionKey].customTriggers.splice(index, 1);
            this.saveSettings();
        }
    }

    /**
     * Get available trigger types
     * @returns {Array} Array of available trigger types
     */
    getTriggerTypes() {
        return [
            { value: 'buildNumber', label: 'Build Number' },
            { value: 'timeSpent', label: 'Time Spent' },
            { value: 'buildName', label: 'Build Name (contains)' }
        ];
    }

    /**
     * Get available actions for triggers
     * @returns {Array} Array of available actions
     */
    getTriggerActions() {
        return [
            { value: 'clickAround', label: 'Click Around' },
            { value: 'scrollUp', label: 'Scroll Up' },
            { value: 'scrollDown', label: 'Scroll Down' },
            { value: 'scrollToTop', label: 'Scroll to Top' },
            { value: 'scrollToBottom', label: 'Scroll to Bottom' }
        ];
    }

    /**
     * Delete a level and all its settings
     * @param {string} levelName - The name of the level to delete
     */
    deleteLevel(levelName) {
        const normalizedName = this.normalizeLevelName(levelName);
        
        if (this.settings[normalizedName]) {
            delete this.settings[normalizedName];
            console.log(`Deleted settings for level: ${levelName}`);
        }
    }
}

// Export a singleton instance
module.exports = new SettingsManager();
