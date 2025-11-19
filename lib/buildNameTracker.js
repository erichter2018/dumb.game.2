/**
 * buildNameTracker.js
 * Tracks build names captured via OCR for each level
 * When all builds are found, updates the stored build count
 */

const fs = require('fs');
const path = require('path');
const settingsManager = require('./settingsManager');

class BuildNameTracker {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'build-names.json');
        this.buildNames = this.loadBuildNames();
        // Track build names for current level run (resets each level)
        this.currentLevelBuildNames = new Map(); // levelName -> { buildNames: [], buildNameToNumber: Map }
    }

    /**
     * Load build names from file
     */
    loadBuildNames() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = fs.readFileSync(this.dataPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading build names:', error);
        }
        return {};
    }

    /**
     * Save build names to file
     */
    saveBuildNames() {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(this.buildNames, null, 2), 'utf8');
            console.log('Build names saved successfully to', this.dataPath);
            return true;
        } catch (error) {
            console.error('Error saving build names:', error);
            return false;
        }
    }

    /**
     * Normalize level name for lookup
     */
    normalizeLevelName(levelName) {
        if (!levelName) return '';
        return levelName.toLowerCase().trim();
    }

    /**
     * Calculate Levenshtein distance between two strings
     * Used to detect OCR mis-reads (e.g., "Apple Juice" vs "Apple Ju1ce")
     */
    levenshteinDistance(str1, str2) {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        const len1 = s1.length;
        const len2 = s2.length;
        
        if (len1 === 0) return len2;
        if (len2 === 0) return len1;
        
        const matrix = [];
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // deletion
                    matrix[i][j - 1] + 1,      // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }
        
        return matrix[len1][len2];
    }

    /**
     * Calculate similarity ratio between two strings (0-1, where 1 is identical)
     */
    similarityRatio(str1, str2) {
        const maxLen = Math.max(str1.length, str2.length);
        if (maxLen === 0) return 1.0;
        const distance = this.levenshteinDistance(str1, str2);
        return 1 - (distance / maxLen);
    }

    /**
     * Check if a build name is similar to existing names (OCR mis-read detection)
     * @param {string} newBuildName - The new build name to check
     * @param {Array<string>} existingNames - Array of existing build names
     * @param {number} threshold - Similarity threshold (0-1), default 0.85 (85% similar)
     * @returns {object|null} Returns {name: existingName, similarity: ratio} if similar, null otherwise
     */
    findSimilarBuildName(newBuildName, existingNames, threshold = 0.85) {
        for (const existingName of existingNames) {
            const similarity = this.similarityRatio(newBuildName, existingName);
            if (similarity >= threshold) {
                return {
                    name: existingName,
                    similarity: similarity
                };
            }
        }
        return null;
    }

    /**
     * Normalize build name for comparison (remove common OCR artifacts)
     * This helps catch cases like "Apple Juice" vs "Apple Ju1ce" vs "Apple Ju1ce "
     */
    normalizeForComparison(buildName) {
        return buildName
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[0-9]/g, '') // Remove numbers (common OCR error: 1 vs l, 0 vs O)
            .replace(/[^a-z\s]/g, ''); // Remove special chars
    }

    /**
     * Add a build name for a level
     * @param {string} levelName - The level name
     * @param {string} buildName - The build name from OCR
     */
    addBuildName(levelName, buildName) {
        if (!levelName || !buildName) return;

        const normalizedLevel = this.normalizeLevelName(levelName);
        const normalizedBuildName = buildName.trim();

        if (!this.buildNames[normalizedLevel]) {
            this.buildNames[normalizedLevel] = {
                buildNames: [],
                lastUpdated: Date.now()
            };
        }

        const existingNames = this.buildNames[normalizedLevel].buildNames;

        // First check for exact match (case-insensitive)
        const exactMatch = existingNames.findIndex(
            name => name.toLowerCase() === normalizedBuildName.toLowerCase()
        );

        if (exactMatch !== -1) {
            console.log(`DEBUG: [BUILD NAME TRACKER] Build name "${normalizedBuildName}" already exists (exact match) for level "${levelName}"`);
            return;
        }

        // Check for similar names (OCR mis-read detection)
        // Use a stricter threshold for shorter names, more lenient for longer names
        const nameLength = normalizedBuildName.length;
        const threshold = nameLength <= 5 ? 0.90 : nameLength <= 10 ? 0.85 : 0.80;
        
        const similarMatch = this.findSimilarBuildName(normalizedBuildName, existingNames, threshold);
        
        if (similarMatch) {
            console.log(`DEBUG: [BUILD NAME TRACKER] Build name "${normalizedBuildName}" is very similar (${(similarMatch.similarity * 100).toFixed(1)}%) to existing "${similarMatch.name}" for level "${levelName}" - skipping to avoid OCR mis-read`);
            
            // If the new name is longer/more complete, consider updating the existing one
            // (OCR sometimes cuts off names, so longer is usually better)
            if (normalizedBuildName.length > similarMatch.name.length && similarMatch.similarity >= 0.90) {
                const existingIndex = existingNames.indexOf(similarMatch.name);
                if (existingIndex !== -1) {
                    console.log(`DEBUG: [BUILD NAME TRACKER] Updating "${similarMatch.name}" -> "${normalizedBuildName}" (new name is longer/more complete)`);
                    existingNames[existingIndex] = normalizedBuildName;
                    this.buildNames[normalizedLevel].lastUpdated = Date.now();
                    this.saveBuildNames();
                }
            }
            return;
        }

        // Also check normalized versions (without numbers/special chars) for common OCR errors
        const normalizedNew = this.normalizeForComparison(normalizedBuildName);
        const normalizedExisting = existingNames.map(name => this.normalizeForComparison(name));
        const normalizedMatch = normalizedExisting.findIndex(norm => norm === normalizedNew);
        
        if (normalizedMatch !== -1 && normalizedNew.length > 3) {
            // Found a match after normalization - likely OCR error (e.g., "Apple Juice" vs "Apple Ju1ce")
            console.log(`DEBUG: [BUILD NAME TRACKER] Build name "${normalizedBuildName}" matches normalized version of "${existingNames[normalizedMatch]}" for level "${levelName}" - skipping to avoid OCR mis-read`);
            return;
        }

        // No match found - add as new unique build name
        existingNames.push(normalizedBuildName);
        this.buildNames[normalizedLevel].lastUpdated = Date.now();
        console.log(`DEBUG: [BUILD NAME TRACKER] Added build name "${normalizedBuildName}" for level "${levelName}" (total: ${existingNames.length})`);
        
        // Check if we should update the build count
        this.checkAndUpdateBuildCount(normalizedLevel, levelName);
        
        this.saveBuildNames();
    }

    /**
     * Get all build names for a level
     * @param {string} levelName - The level name
     * @returns {Array<string>} Array of build names
     */
    getBuildNames(levelName) {
        const normalizedLevel = this.normalizeLevelName(levelName);
        return this.buildNames[normalizedLevel]?.buildNames || [];
    }

    /**
     * Get the count of unique build names for a level
     * @param {string} levelName - The level name
     * @returns {number} Count of unique build names
     */
    getBuildNameCount(levelName) {
        return this.getBuildNames(levelName).length;
    }

    /**
     * Check if we should update the stored build count
     * This happens when we've collected enough build names and they seem stable
     * @param {string} normalizedLevel - Normalized level name
     * @param {string} originalLevelName - Original level name (for settings lookup)
     */
    checkAndUpdateBuildCount(normalizedLevel, originalLevelName) {
        const buildNames = this.buildNames[normalizedLevel]?.buildNames || [];
        const currentCount = buildNames.length;
        
        if (currentCount === 0) return;

        // Get current stored build count
        const levelSettings = settingsManager.getLevelSettings(originalLevelName);
        const storedCount = levelSettings.minBuildCount || 0;

        // If we have more build names than stored count, update it
        if (currentCount > storedCount) {
            console.log(`DEBUG: [BUILD NAME TRACKER] Updating build count for "${originalLevelName}": ${storedCount} -> ${currentCount} (based on ${currentCount} unique build names found)`);
            
            // Update in settings
            const normalizedName = settingsManager.normalizeLevelName(originalLevelName);
            const settings = settingsManager.settings;
            
            if (!settings[normalizedName]) {
                settings[normalizedName] = {};
            }
            
            settings[normalizedName].minBuildCount = currentCount;
            settingsManager.saveSettings();
            
            // Mark that we've auto-updated this level
            if (!this.buildNames[normalizedLevel]) {
                this.buildNames[normalizedLevel] = {};
            }
            this.buildNames[normalizedLevel].autoUpdatedCount = true;
            this.buildNames[normalizedLevel].autoUpdatedAt = Date.now();
        }
    }

    /**
     * Get statistics for a level
     * @param {string} levelName - The level name
     * @returns {object} Statistics object
     */
    getStats(levelName) {
        const normalizedLevel = this.normalizeLevelName(levelName);
        const data = this.buildNames[normalizedLevel];
        
        if (!data) {
            return {
                buildNames: [],
                count: 0,
                lastUpdated: null,
                autoUpdatedCount: false
            };
        }

        return {
            buildNames: data.buildNames || [],
            count: data.buildNames?.length || 0,
            lastUpdated: data.lastUpdated || null,
            autoUpdatedCount: data.autoUpdatedCount || false,
            autoUpdatedAt: data.autoUpdatedAt || null
        };
    }

    /**
     * Reset tracking for a new level (call when level starts)
     * @param {string} levelName - The level name
     */
    resetLevelTracking(levelName) {
        const normalizedLevel = this.normalizeLevelName(levelName);
        this.currentLevelBuildNames.set(normalizedLevel, {
            buildNames: [],
            buildNameToNumber: new Map(), // Maps build name -> build number
            buildNumberToName: new Map()  // Maps build number -> build name
        });
        console.log(`DEBUG: [BUILD NAME TRACKER] Reset tracking for level "${levelName}"`);
    }

    /**
     * Get or assign build number for a build name
     * Returns the build number for this build name (1-indexed)
     * If it's a new build name, assigns a new build number
     * If it's a build name we've seen before in this level, returns the same build number
     * @param {string} levelName - The level name
     * @param {string} buildName - The build name from OCR
     * @returns {number|null} Build number (1, 2, 3...) or null if build name is invalid
     */
    getOrAssignBuildNumber(levelName, buildName) {
        if (!levelName || !buildName) return null;

        const normalizedLevel = this.normalizeLevelName(levelName);
        const normalizedBuildName = buildName.trim();

        // Initialize tracking for this level if not exists
        if (!this.currentLevelBuildNames.has(normalizedLevel)) {
            this.resetLevelTracking(levelName);
        }

        const levelTracking = this.currentLevelBuildNames.get(normalizedLevel);
        const buildNameToNumber = levelTracking.buildNameToNumber;
        const buildNumberToName = levelTracking.buildNumberToName;

        // Check if we've seen this exact build name before (case-insensitive)
        const exactMatch = Array.from(buildNameToNumber.keys()).find(
            name => name.toLowerCase() === normalizedBuildName.toLowerCase()
        );

        if (exactMatch) {
            const buildNumber = buildNameToNumber.get(exactMatch);
            console.log(`DEBUG: [BUILD NAME TRACKER] Build name "${normalizedBuildName}" already seen in this level - using build number ${buildNumber}`);
            return buildNumber;
        }

        // Check for similar build names (OCR mis-read detection)
        const nameLength = normalizedBuildName.length;
        const threshold = nameLength <= 5 ? 0.90 : nameLength <= 10 ? 0.85 : 0.80;
        
        for (const [existingName, buildNumber] of buildNameToNumber.entries()) {
            const similarity = this.similarityRatio(normalizedBuildName, existingName);
            if (similarity >= threshold) {
                console.log(`DEBUG: [BUILD NAME TRACKER] Build name "${normalizedBuildName}" is very similar (${(similarity * 100).toFixed(1)}%) to "${existingName}" (build #${buildNumber}) - using same build number`);
                // Update the mapping to use the better name if it's longer/more complete
                if (normalizedBuildName.length > existingName.length && similarity >= 0.90) {
                    buildNameToNumber.delete(existingName);
                    buildNameToNumber.set(normalizedBuildName, buildNumber);
                    buildNumberToName.set(buildNumber, normalizedBuildName);
                    console.log(`DEBUG: [BUILD NAME TRACKER] Updated build #${buildNumber} name: "${existingName}" -> "${normalizedBuildName}"`);
                }
                return buildNumber;
            }
        }

        // Check normalized versions (without numbers/special chars)
        const normalizedNew = this.normalizeForComparison(normalizedBuildName);
        for (const [existingName, buildNumber] of buildNameToNumber.entries()) {
            const normalizedExisting = this.normalizeForComparison(existingName);
            if (normalizedNew === normalizedExisting && normalizedNew.length > 3) {
                console.log(`DEBUG: [BUILD NAME TRACKER] Build name "${normalizedBuildName}" matches normalized version of "${existingName}" (build #${buildNumber}) - using same build number`);
                return buildNumber;
            }
        }

        // NEW build name - assign next build number
        const nextBuildNumber = buildNameToNumber.size + 1;
        buildNameToNumber.set(normalizedBuildName, nextBuildNumber);
        buildNumberToName.set(nextBuildNumber, normalizedBuildName);
        levelTracking.buildNames.push(normalizedBuildName);
        
        console.log(`DEBUG: [BUILD NAME TRACKER] NEW build name "${normalizedBuildName}" assigned build number ${nextBuildNumber} for level "${levelName}"`);
        
        // Also add to persistent database
        this.addBuildName(levelName, normalizedBuildName);
        
        return nextBuildNumber;
    }

    /**
     * Get build number for a build name in current level (if already assigned)
     * @param {string} levelName - The level name
     * @param {string} buildName - The build name
     * @returns {number|null} Build number or null if not found
     */
    getBuildNumberForName(levelName, buildName) {
        if (!levelName || !buildName) return null;
        
        const normalizedLevel = this.normalizeLevelName(levelName);
        const normalizedBuildName = buildName.trim();
        
        const levelTracking = this.currentLevelBuildNames.get(normalizedLevel);
        if (!levelTracking) return null;
        
        // Check exact match
        for (const [name, buildNumber] of levelTracking.buildNameToNumber.entries()) {
            if (name.toLowerCase() === normalizedBuildName.toLowerCase()) {
                return buildNumber;
            }
        }
        
        // Check similar names
        const nameLength = normalizedBuildName.length;
        const threshold = nameLength <= 5 ? 0.90 : nameLength <= 10 ? 0.85 : 0.80;
        
        for (const [existingName, buildNumber] of levelTracking.buildNameToNumber.entries()) {
            const similarity = this.similarityRatio(normalizedBuildName, existingName);
            if (similarity >= threshold) {
                return buildNumber;
            }
        }
        
        return null;
    }
}

// Export singleton instance
module.exports = new BuildNameTracker();

