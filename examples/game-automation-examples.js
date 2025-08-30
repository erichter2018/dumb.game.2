// iPhone Game Automation Examples
// Copy and paste these scripts into the script editor

// ========================================
// Example 1: Auto Clicker for Tapping Games
// ========================================
/*
// Click at the center of the screen every 1 second
for (let i = 0; i < 30; i++) {
    await click(400, 300);
    updateStatus(`Auto-click ${i + 1}/30`);
    await new Promise(resolve => setTimeout(resolve, 1000));
}
*/

// ========================================
// Example 2: Color-Based Button Detection
// ========================================
/*
// Find and click a red button
const redButton = await findColor(
    {x: 0, y: 0, width: 800, height: 600}, 
    {r: 255, g: 0, b: 0}, // Red
    30 // Tolerance
);
if (redButton) {
    updateStatus('Found red button, clicking...');
    await click(redButton.x, redButton.y);
} else {
    updateStatus('Red button not found');
}
*/

// ========================================
// Example 3: Multi-Color Detection
// ========================================
/*
// Look for multiple colors and click the first one found
const colors = [
    {name: 'Red', r: 255, g: 0, b: 0},
    {name: 'Green', r: 0, g: 255, b: 0},
    {name: 'Blue', r: 0, g: 0, b: 255},
    {name: 'Yellow', r: 255, g: 255, b: 0}
];

for (const color of colors) {
    const found = await findColor(
        {x: 0, y: 0, width: 800, height: 600},
        color,
        25
    );
    
    if (found) {
        updateStatus(`Found ${color.name} button, clicking...`);
        await click(found.x, found.y);
        break;
    }
}
*/

// ========================================
// Example 4: Continuous Monitoring
// ========================================
/*
// Monitor for a specific color and click when found
for (let i = 0; i < 60; i++) { // Run for 60 seconds
    const target = await findColor(
        {x: 0, y: 0, width: 800, height: 600},
        {r: 0, g: 255, b: 0}, // Green
        20
    );
    
    if (target) {
        updateStatus('Target found! Clicking...');
        await click(target.x, target.y);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    } else {
        updateStatus(`Monitoring... (${i + 1}/60)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
*/

// ========================================
// Example 5: Pattern Recognition
// ========================================
/*
// Click in a specific pattern (useful for puzzle games)
const pattern = [
    {x: 200, y: 200},
    {x: 400, y: 200},
    {x: 600, y: 200},
    {x: 200, y: 400},
    {x: 400, y: 400},
    {x: 600, y: 400}
];

for (let i = 0; i < pattern.length; i++) {
    const point = pattern[i];
    await click(point.x, point.y);
    updateStatus(`Pattern step ${i + 1}/${pattern.length}`);
    await new Promise(resolve => setTimeout(resolve, 500));
}
*/

// ========================================
// Example 6: Smart Waiting
// ========================================
/*
// Wait for a specific color to appear, then click
let attempts = 0;
const maxAttempts = 30;

while (attempts < maxAttempts) {
    const target = await findColor(
        {x: 0, y: 0, width: 800, height: 600},
        {r: 255, g: 165, b: 0}, // Orange
        25
    );
    
    if (target) {
        updateStatus('Orange target appeared! Clicking...');
        await click(target.x, target.y);
        break;
    }
    
    attempts++;
    updateStatus(`Waiting for target... (${attempts}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
}

if (attempts >= maxAttempts) {
    updateStatus('Target never appeared');
}
*/

// ========================================
// Example 7: Multi-Step Automation
// ========================================
/*
// Complex automation with multiple steps
updateStatus('Starting multi-step automation...');

// Step 1: Find and click start button
const startButton = await findColor(
    {x: 0, y: 0, width: 800, height: 600},
    {r: 0, g: 128, b: 0}, // Dark green
    30
);

if (startButton) {
    updateStatus('Step 1: Clicking start button');
    await click(startButton.x, startButton.y);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Wait for game to load and find play button
    const playButton = await findColor(
        {x: 0, y: 0, width: 800, height: 600},
        {r: 255, g: 0, b: 0}, // Red
        25
    );
    
    if (playButton) {
        updateStatus('Step 2: Clicking play button');
        await click(playButton.x, playButton.y);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 3: Auto-click for 10 seconds
        updateStatus('Step 3: Auto-clicking for 10 seconds');
        for (let i = 0; i < 10; i++) {
            await click(400, 300);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        updateStatus('Automation completed!');
    } else {
        updateStatus('Play button not found');
    }
} else {
    updateStatus('Start button not found');
}
*/

// ========================================
// Example 8: Keyboard Input Automation
// ========================================
/*
// Type text and press enter
updateStatus('Typing username...');
await type('player123');
await new Promise(resolve => setTimeout(resolve, 500));

updateStatus('Pressing enter...');
await keyTap('enter');
await new Promise(resolve => setTimeout(resolve, 1000));

updateStatus('Typing password...');
await type('password123');
await new Promise(resolve => setTimeout(resolve, 500));

updateStatus('Pressing enter...');
await keyTap('enter');
*/

// ========================================
// Example 9: Adaptive Clicking
// ========================================
/*
// Click around a detected color with some randomness
const center = await findColor(
    {x: 0, y: 0, width: 800, height: 600},
    {r: 255, g: 255, b: 255}, // White
    20
);

if (center) {
    // Click in a small area around the detected point
    for (let i = 0; i < 5; i++) {
        const offsetX = Math.floor(Math.random() * 40) - 20; // -20 to +20
        const offsetY = Math.floor(Math.random() * 40) - 20; // -20 to +20
        
        const clickX = center.x + offsetX;
        const clickY = center.y + offsetY;
        
        updateStatus(`Adaptive click ${i + 1}/5 at (${clickX}, ${clickY})`);
        await click(clickX, clickY);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
*/

// ========================================
// Example 10: Game State Detection
// ========================================
/*
// Detect different game states by looking for specific colors
const gameStates = {
    menu: {r: 128, g: 128, b: 128}, // Gray
    playing: {r: 0, g: 255, b: 0},   // Green
    paused: {r: 255, g: 255, b: 0},  // Yellow
    gameOver: {r: 255, g: 0, b: 0}   // Red
};

for (let i = 0; i < 30; i++) {
    let currentState = null;
    
    for (const [state, color] of Object.entries(gameStates)) {
        const found = await findColor(
            {x: 0, y: 0, width: 800, height: 600},
            color,
            30
        );
        
        if (found) {
            currentState = state;
            break;
        }
    }
    
    if (currentState) {
        updateStatus(`Game state: ${currentState}`);
        
        if (currentState === 'playing') {
            // Auto-click during gameplay
            await click(400, 300);
        } else if (currentState === 'menu') {
            // Click menu button
            await click(400, 500);
        }
    } else {
        updateStatus('Unknown game state');
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
}
*/

