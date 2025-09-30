const fs = require('fs');
const path = require('path');

/**
 * Settings Manager - Manages level-specific automation settings
 * Loads settings from levelSettings.json and provides methods to get settings for specific levels
 */

class SettingsManager {
    constructor() {
        this.settingsPath = path.join(__dirname, 'levelSettings.json');
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
                scrollToBottomAfterFirstBuild: false,
                scrollToBottomAfterSecondBuild: false,
                perfectStartingPosition: 'nothing',
                firstBuildAction: {
                    action: 'nothing',
                    triggerTimeMs: null
                },
                secondBuildAction: {
                    action: 'nothing',
                    triggerTimeMs: null
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
        
        // Merge with defaults (level settings override defaults)
        const merged = {
            ...this.defaults,
            ...levelSettings,
            // Handle nested objects specially
            firstBuildAction: {
                ...this.defaults.firstBuildAction,
                ...(levelSettings.firstBuildAction || {})
            },
            secondBuildAction: {
                ...this.defaults.secondBuildAction,
                ...(levelSettings.secondBuildAction || {})
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
}

// Export a singleton instance
module.exports = new SettingsManager();
