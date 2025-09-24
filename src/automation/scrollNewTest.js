// New scrolling test functions - completely separate from existing scrolling code
// This file is for testing new scrolling mechanics without interfering with existing functionality

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const robot = require('robotjs');
const redBlobDetector = require('../detection/redBlobDetector');

async function scrollNewUpTest(dependencies) {
    console.log('DEBUG: New scroll up test function called - performing 3 consecutive scrolls');
    
    const { captureScreenRegion, iphoneMirroringRegion } = dependencies;
    
    try {
        // Step 1: Focus iPhone Mirroring app
        console.log('DEBUG: Focusing iPhone Mirroring app...');
        await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Step 2: Capture initial screen state
        console.log('DEBUG: Capturing initial red blob positions...');
        let currentScreenDataUrl = await captureScreenRegion();
        let currentRedBlobs = await redBlobDetector.detect(currentScreenDataUrl, iphoneMirroringRegion);
        console.log(`DEBUG: Found ${currentRedBlobs.length} red blobs initially`);
        
        const scrollResults = [];
        let cumulativeDisplacement = 0;
        
        // Perform 3 consecutive scrolls
        for (let scrollNum = 1; scrollNum <= 3; scrollNum++) {
            console.log(`DEBUG: === Scroll ${scrollNum}/3 ===`);
            
            // Store previous state
            const previousRedBlobs = [...currentRedBlobs];
            
            // Perform scroll
            console.log(`DEBUG: Performing scroll ${scrollNum}...`);
            await performSmoothScroll('up', 100, iphoneMirroringRegion);
            
            // Wait for UI to settle
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Capture new state
            currentScreenDataUrl = await captureScreenRegion();
            currentRedBlobs = await redBlobDetector.detect(currentScreenDataUrl, iphoneMirroringRegion);
            console.log(`DEBUG: Found ${currentRedBlobs.length} red blobs after scroll ${scrollNum}`);
            
            // Analyze this scroll
            const analysis = analyzeScrollDisplacement(previousRedBlobs, currentRedBlobs, 'up', 100);
            cumulativeDisplacement += analysis.averageDisplacement;
            
            scrollResults.push({
                scrollNumber: scrollNum,
                displacement: analysis.averageDisplacement,
                successRate: analysis.successRate,
                blobCount: analysis.blobCount,
                message: analysis.message
            });
            
            console.log(`DEBUG: Scroll ${scrollNum} - ${analysis.message}`);
            
            // Short delay between scrolls
            if (scrollNum < 3) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        // Calculate overall results
        const averageDisplacement = scrollResults.reduce((sum, result) => sum + result.displacement, 0) / scrollResults.length;
        const averageSuccessRate = scrollResults.reduce((sum, result) => sum + result.successRate, 0) / scrollResults.length;
        const totalDisplacement = cumulativeDisplacement;
        const consistency = scrollResults.filter(r => Math.abs(r.displacement - averageDisplacement) <= 20).length / scrollResults.length * 100;
        
        console.log(`DEBUG: === Overall Results ===`);
        console.log(`DEBUG: Average displacement: ${averageDisplacement.toFixed(1)}px`);
        console.log(`DEBUG: Total displacement: ${totalDisplacement.toFixed(1)}px`);
        console.log(`DEBUG: Average success rate: ${averageSuccessRate.toFixed(1)}%`);
        console.log(`DEBUG: Consistency: ${consistency.toFixed(1)}%`);
        
        return {
            success: true,
            expectedDistance: 100,
            scrollCount: 3,
            averageDisplacement: averageDisplacement,
            totalDisplacement: totalDisplacement,
            averageSuccessRate: averageSuccessRate,
            consistency: consistency,
            direction: 'up',
            individualResults: scrollResults,
            message: `3 scrolls: Avg ${averageDisplacement.toFixed(1)}px each (${totalDisplacement.toFixed(1)}px total), ${averageSuccessRate.toFixed(1)}% success, ${consistency.toFixed(1)}% consistent`
        };
        
    } catch (error) {
        console.error('ERROR: Scroll up test failed:', error);
        return { success: false, error: error.message };
    }
}

async function scrollNewDownTest(dependencies) {
    console.log('DEBUG: New scroll down test function called - performing 3 consecutive scrolls');
    
    const { captureScreenRegion, iphoneMirroringRegion } = dependencies;
    
    try {
        // Step 1: Focus iPhone Mirroring app
        console.log('DEBUG: Focusing iPhone Mirroring app...');
        await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Step 2: Capture initial screen state
        console.log('DEBUG: Capturing initial red blob positions...');
        let currentScreenDataUrl = await captureScreenRegion();
        let currentRedBlobs = await redBlobDetector.detect(currentScreenDataUrl, iphoneMirroringRegion);
        console.log(`DEBUG: Found ${currentRedBlobs.length} red blobs initially`);
        
        const scrollResults = [];
        let cumulativeDisplacement = 0;
        
        // Perform 3 consecutive scrolls
        for (let scrollNum = 1; scrollNum <= 3; scrollNum++) {
            console.log(`DEBUG: === Scroll ${scrollNum}/3 ===`);
            
            // Store previous state
            const previousRedBlobs = [...currentRedBlobs];
            
            // Perform scroll
            console.log(`DEBUG: Performing scroll ${scrollNum}...`);
            await performSmoothScroll('down', 100, iphoneMirroringRegion);
            
            // Wait for UI to settle
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Capture new state
            currentScreenDataUrl = await captureScreenRegion();
            currentRedBlobs = await redBlobDetector.detect(currentScreenDataUrl, iphoneMirroringRegion);
            console.log(`DEBUG: Found ${currentRedBlobs.length} red blobs after scroll ${scrollNum}`);
            
            // Analyze this scroll
            const analysis = analyzeScrollDisplacement(previousRedBlobs, currentRedBlobs, 'down', 100);
            cumulativeDisplacement += analysis.averageDisplacement;
            
            scrollResults.push({
                scrollNumber: scrollNum,
                displacement: analysis.averageDisplacement,
                successRate: analysis.successRate,
                blobCount: analysis.blobCount,
                message: analysis.message
            });
            
            console.log(`DEBUG: Scroll ${scrollNum} - ${analysis.message}`);
            
            // Short delay between scrolls
            if (scrollNum < 3) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        // Calculate overall results
        const averageDisplacement = scrollResults.reduce((sum, result) => sum + result.displacement, 0) / scrollResults.length;
        const averageSuccessRate = scrollResults.reduce((sum, result) => sum + result.successRate, 0) / scrollResults.length;
        const totalDisplacement = cumulativeDisplacement;
        const consistency = scrollResults.filter(r => Math.abs(r.displacement - averageDisplacement) <= 20).length / scrollResults.length * 100;
        
        console.log(`DEBUG: === Overall Results ===`);
        console.log(`DEBUG: Average displacement: ${averageDisplacement.toFixed(1)}px`);
        console.log(`DEBUG: Total displacement: ${totalDisplacement.toFixed(1)}px`);
        console.log(`DEBUG: Average success rate: ${averageSuccessRate.toFixed(1)}%`);
        console.log(`DEBUG: Consistency: ${consistency.toFixed(1)}%`);
        
        return {
            success: true,
            expectedDistance: 100,
            scrollCount: 3,
            averageDisplacement: averageDisplacement,
            totalDisplacement: totalDisplacement,
            averageSuccessRate: averageSuccessRate,
            consistency: consistency,
            direction: 'down',
            individualResults: scrollResults,
            message: `3 scrolls: Avg ${averageDisplacement.toFixed(1)}px each (${totalDisplacement.toFixed(1)}px total), ${averageSuccessRate.toFixed(1)}% success, ${consistency.toFixed(1)}% consistent`
        };
        
    } catch (error) {
        console.error('ERROR: Scroll down test failed:', error);
        return { success: false, error: error.message };
    }
}

// Helper function to perform smooth scroll using AppleScript
async function performSmoothScroll(direction, pixels, iphoneMirroringRegion) {
    const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = iphoneMirroringRegion;
    
    // Calculate center point of the iPhone Mirroring region
    const centerX = regionX + regionWidth / 2;
    const centerY = regionY + regionHeight / 2;
    
    let startY, endY;
    if (direction === 'up') {
        // Scroll up: start from lower position, swipe to higher position
        startY = centerY + pixels / 2;
        endY = centerY - pixels / 2;
    } else {
        // Scroll down: start from higher position, swipe to lower position  
        startY = centerY - pixels / 2;
        endY = centerY + pixels / 2;
    }
    
    // Try multiple approaches for better scrolling
    console.log(`DEBUG: Executing enhanced scroll ${direction} from (${centerX}, ${startY}) to (${centerX}, ${endY})`);
    
    // Step 1: Activate iPhone Mirroring
    await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Step 2: Try AppleScript touch simulation first (more native to mobile)
    console.log(`DEBUG: Attempting AppleScript touch simulation`);
    try {
        // Use AppleScript to simulate touch gesture with proper timing
        const touchScript = `
            tell application "System Events"
                tell process "iPhone Mirroring"
                    set frontmost to true
                    delay 0.1
                    -- Simulate touch down
                    set mouse position to {${centerX}, ${startY}}
                    delay 0.05
                    mouse down at {${centerX}, ${startY}}
                    delay 0.1
                    -- Smooth drag with intermediate points
                    set mouse position to {${centerX}, ${Math.floor((startY + endY) / 2)}}
                    delay 0.05
                    set mouse position to {${centerX}, ${endY}}
                    delay 0.1
                    mouse up at {${centerX}, ${endY}}
                end tell
            end tell
        `;
        await execAsync(`osascript -e '${touchScript}'`);
        console.log(`DEBUG: AppleScript touch simulation completed`);
    } catch (error) {
        console.log(`DEBUG: AppleScript failed, falling back to robotjs: ${error.message}`);
        
        // Fallback to enhanced robotjs approach
        console.log(`DEBUG: Using enhanced robotjs smooth scroll`);
        
        // Move mouse to start position
        robot.moveMouse(centerX, startY);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Press and hold left mouse button
        robot.mouseToggle('down', 'left');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Create smooth velocity curve for natural scrolling
        const totalDistance = Math.abs(endY - startY);
        const duration = 400; // Longer duration for smoother gesture
        const steps = 40; // More steps for smoother motion
        const stepDelay = duration / steps;
        
        // Use easing function for natural touch-like movement
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        
        for (let i = 0; i <= steps; i++) {
            const progress = i / steps;
            const easedProgress = easeOutCubic(progress);
            const currentY = startY + (endY - startY) * easedProgress;
            
            robot.dragMouse(centerX, currentY);
            await new Promise(resolve => setTimeout(resolve, stepDelay));
        }
        
        // Release left mouse button
        robot.mouseToggle('up', 'left');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return { success: true };
}

// Helper function to analyze scroll displacement using red blob positions
function analyzeScrollDisplacement(initialBlobs, finalBlobs, direction, expectedPixels) {
    console.log(`DEBUG: Analyzing displacement - Initial: ${initialBlobs.length} blobs, Final: ${finalBlobs.length} blobs`);
    
    // Filter out research blobs and other special blobs for more accurate measurement
    const initialRegularBlobs = initialBlobs.filter(blob => !blob.name);
    const finalRegularBlobs = finalBlobs.filter(blob => !blob.name);
    
    console.log(`DEBUG: After filtering special blobs - Initial: ${initialRegularBlobs.length} regular blobs, Final: ${finalRegularBlobs.length} regular blobs`);
    
    if (initialRegularBlobs.length === 0 || finalRegularBlobs.length === 0) {
        return {
            averageDisplacement: 0,
            successRate: 0,
            blobCount: 0,
            message: 'No regular blobs available for measurement'
        };
    }
    
    // Use Hungarian algorithm approach for optimal matching
    const matchedPairs = [];
    const usedFinalBlobs = new Set();
    
    // Find best matches with stricter criteria
    for (const initialBlob of initialRegularBlobs) {
        let bestMatch = null;
        let bestScore = Infinity;
        
        for (const finalBlob of finalRegularBlobs) {
            if (usedFinalBlobs.has(finalBlob)) continue; // Already matched
            
            // Calculate distance between blob centers
            const distance = Math.sqrt(
                Math.pow(initialBlob.x - finalBlob.x, 2) + 
                Math.pow(initialBlob.y - finalBlob.y, 2)
            );
            
            // Much stricter matching criteria
            const maxAllowedDistance = Math.min(150, expectedPixels * 1.5); // Allow some scroll variance
            const yDisplacement = Math.abs(finalBlob.y - initialBlob.y);
            
            // Must be reasonable distance AND reasonable Y displacement
            if (distance < maxAllowedDistance && yDisplacement < maxAllowedDistance) {
                // Score based on distance (lower is better)
                if (distance < bestScore) {
                    bestMatch = finalBlob;
                    bestScore = distance;
                }
            }
        }
        
        if (bestMatch) {
            matchedPairs.push({
                initial: initialBlob,
                final: bestMatch,
                distance: bestScore
            });
            usedFinalBlobs.add(bestMatch);
        }
    }
    
    console.log(`DEBUG: Found ${matchedPairs.length} high-quality blob pairs for measurement`);
    
    if (matchedPairs.length === 0) {
        return {
            averageDisplacement: 0,
            successRate: 0,
            blobCount: 0,
            message: 'No reliable blob matches found for measurement'
        };
    }
    
    // Calculate displacement for each matched pair
    const displacements = matchedPairs.map(pair => {
        const yDisplacement = pair.final.y - pair.initial.y;
        return direction === 'up' ? -yDisplacement : yDisplacement; // Make positive for expected direction
    });
    
    // Calculate statistics
    const averageDisplacement = displacements.reduce((sum, disp) => sum + disp, 0) / displacements.length;
    const minDisplacement = Math.min(...displacements);
    const maxDisplacement = Math.max(...displacements);
    const displacementVariance = displacements.reduce((sum, disp) => sum + Math.pow(disp - averageDisplacement, 2), 0) / displacements.length;
    const displacementStdDev = Math.sqrt(displacementVariance);
    
    console.log(`DEBUG: Displacement stats - Avg: ${averageDisplacement.toFixed(1)}px, Range: ${minDisplacement.toFixed(1)}-${maxDisplacement.toFixed(1)}px, StdDev: ${displacementStdDev.toFixed(1)}px`);
    
    // Filter out outliers (displacements more than 2 standard deviations from mean)
    const filteredDisplacements = displacements.filter(disp => 
        Math.abs(disp - averageDisplacement) <= 2 * displacementStdDev
    );
    
    if (filteredDisplacements.length === 0) {
        return {
            averageDisplacement: averageDisplacement,
            successRate: 0,
            blobCount: matchedPairs.length,
            message: `Scrolled ${averageDisplacement.toFixed(1)}px ${direction} but measurements were inconsistent (std dev: ${displacementStdDev.toFixed(1)}px)`
        };
    }
    
    const filteredAverage = filteredDisplacements.reduce((sum, disp) => sum + disp, 0) / filteredDisplacements.length;
    
    // Calculate success rate based on how close we got to expected distance
    const accuracy = Math.max(0, 100 - Math.abs(filteredAverage - expectedPixels) / expectedPixels * 100);
    
    const consistency = filteredDisplacements.length / displacements.length * 100;
    
    return {
        averageDisplacement: filteredAverage,
        successRate: accuracy,
        blobCount: filteredDisplacements.length,
        totalBlobs: matchedPairs.length,
        consistency: consistency,
        message: `Scrolled ${filteredAverage.toFixed(1)}px ${direction} (expected ${expectedPixels}px) with ${accuracy.toFixed(1)}% accuracy, ${consistency.toFixed(1)}% consistency`
    };
}

module.exports = {
    scrollNewUpTest,
    scrollNewDownTest
};
