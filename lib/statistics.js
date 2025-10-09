/**
 * GAME STATISTICS AND STAGE DEFINITIONS
 * 
 * CONCEPT: STAGES
 * The game has multiple levels grouped together in stages. Each stage begins with a level 
 * whose name contains one of the city names listed below. When a level name contains any 
 * of these city names, it marks the start of a new stage.
 * 
 * NOTE: Multi-word city names (e.g., "San Francisco", "New York") are treated as single 
 * stage identifiers, not separate terms.
 */

// Stage identifiers - City names that mark the beginning of a new stage
const STAGE_CITIES = [
    // Cities 1-20
    'San Francisco',
    'New York', 
    'Miami',
    'Paris',
    'London',
    'Tokyo',
    'Venice',
    'Beirut',
    'Berlin',
    'Oslo',
    'Rome',
    'Warsaw',
    'Johannesburg',
    'Stockholm',
    'Mexico City',
    'Portland',
    'Toronto',
    'Sydney',
    'Lyon',
    'Glasgow',
    
    // Cities 21-40
    'Beijing',
    'Bruges',
    'Istanbul',
    'Hamburg',
    'Zurich',
    'Milan',
    'Budapest',
    'Nairobi',
    'Helsinki',
    'Sao Paulo',
    'Seattle',
    'San Diego',
    'Santa Monica',
    'Brussels',
    'Luxembourg',
    'Hong Kong',
    'Treviso',
    'Marrakesh',
    'Cologne',
    'Tallinn',
    
    // Cities 41-60
    'Florence',
    'Prague',
    'Cape Town',
    'Copenhagen',
    'Lima',
    'Los Angeles',
    'Pittsburgh',
    'Nassau',
    'Madrid',
    'Amsterdam',
    'Seoul',
    'Birmingham',
    'Cairo',
    'Frankfurt',
    'Quebec',
    'Naples',
    'Zagreb',
    'Pretoria',
    'Gothenburg',
    'Santiago'
];

/**
 * Check if a level name indicates the start of a new stage
 * @param {string} levelName - The name of the level to check
 * @returns {boolean} - True if this level starts a new stage
 */
function isStageStart(levelName) {
    if (!levelName || typeof levelName !== 'string') {
        return false;
    }
    
    const levelNameLower = levelName.toLowerCase();
    
    return STAGE_CITIES.some(city => 
        levelNameLower.includes(city.toLowerCase())
    );
}

/**
 * Get the stage city name from a level name
 * @param {string} levelName - The name of the level
 * @returns {string|null} - The city name if found, null otherwise
 */
function getStageCity(levelName) {
    if (!levelName || typeof levelName !== 'string') {
        return null;
    }
    
    const levelNameLower = levelName.toLowerCase();
    
    const foundCity = STAGE_CITIES.find(city => 
        levelNameLower.includes(city.toLowerCase())
    );
    
    return foundCity || null;
}

module.exports = {
    STAGE_CITIES,
    isStageStart,
    getStageCity
};
