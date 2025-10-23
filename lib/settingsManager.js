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
            this.settings = data.levels || {};
            console.log('Settings loaded successfully from', this.settingsPath);
        } catch (error) {
            console.error('Error loading settings:', error);
            // Use fallback defaults if file doesn't exist or is invalid
            this.defaults = {
                doResearch: true,
                scrollDirection: 'up',
                blueBoxClickHoldDuration: 4500,
                optimized: true, // Default for 'up' direction
                scrollToBottomAfterFirstBuild: true,
                scrollToBottomAfterSecondBuild: false,
                perfectStartingPosition: {
                    action: 'nothing',
                    waitTimeMs: null
                },
                firstBuildAction: {
                    action: 'nothing',
                    triggerTimeMs: null,
                    clickOffAndScrollDistance: 150,
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
                    clickaroundOptions: {
                        excludeRedBlobs: true,
                        clickaroundChunks: 3,
                        scrollUpDistance: 200,
                        scrollUpCount: 5,
                        initialScrollDown: 150,
                        scrollToBottomAtEnd: false
                    }
                }
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
            }
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
        
        // Merge with defaults
        const merged = {
            optimized: directionSettings.optimized !== undefined 
                ? directionSettings.optimized 
                : (direction === 'up' ? true : false), // Default: optimized for 'up', not for 'down'
            scrollToBottomAfterFirstBuild: directionSettings.scrollToBottomAfterFirstBuild !== undefined
                ? directionSettings.scrollToBottomAfterFirstBuild
                : this.defaults.scrollToBottomAfterFirstBuild,
            scrollToBottomAfterSecondBuild: directionSettings.scrollToBottomAfterSecondBuild !== undefined
                ? directionSettings.scrollToBottomAfterSecondBuild
                : this.defaults.scrollToBottomAfterSecondBuild,
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
                clickaroundOptions: {
                    ...this.defaults.firstBuildAction.clickaroundOptions,
                    ...((directionSettings.firstBuildAction && directionSettings.firstBuildAction.clickaroundOptions) || {})
                }
            },
            secondBuildAction: {
                ...this.defaults.secondBuildAction,
                ...(directionSettings.secondBuildAction || {}),
                clickaroundOptions: {
                    ...this.defaults.secondBuildAction.clickaroundOptions,
                    ...((directionSettings.secondBuildAction && directionSettings.secondBuildAction.clickaroundOptions) || {})
                }
            }
        };
        
        return merged;
    }
}

// Export a singleton instance
module.exports = new SettingsManager();
