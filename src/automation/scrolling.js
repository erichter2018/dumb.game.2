const robot = require('robotjs'); // Import robotjs

// Helper function to generate a random integer between min and max (inclusive)
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// New functions for scrolling vertically
async function scrollDown(x, y, distance) {
  // updateCurrentFunction is passed as a dependency from main.js
  // updateCurrentFunction('scrollDown'); // Update current function
  try {
    console.log(`DEBUG: scrollDown - Performing smooth scroll down ${distance}px at (${x}, ${y})`);
    
    // Calculate start and end positions for scrolling down
    const startY = y + distance / 2;
    const endY = y - distance / 2;
    
    // 1. Move mouse to start point
    robot.moveMouse(x, startY);
    await new Promise(resolve => setTimeout(resolve, 100)); 

    // 2. Press and hold left mouse button
    robot.mouseToggle('down', 'left');
    await new Promise(resolve => setTimeout(resolve, 100)); 

    // 3. Perform smooth drag with easing
    const duration = 400; // Longer duration for smoother gesture
    const steps = 40; // More steps for smoother motion
    const stepDelay = duration / steps;
    
    // Use easing function for natural touch-like movement
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const easedProgress = easeOutCubic(progress);
      const currentY = startY + (endY - startY) * easedProgress;
      
      robot.dragMouse(x, currentY);
      await new Promise(resolve => setTimeout(resolve, stepDelay));
    }

    // 4. Release left mouse button
    robot.mouseToggle('up', 'left');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`DEBUG: scrollDown - Smooth scroll completed`);
    return { success: true };
  } catch (error) {
    console.error(`Error executing RobotJS scroll down: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function scrollUp(x, y, dependencies) { // Accept dependencies to access CLICK_AREAS and performClick
  const { updateCurrentFunction, CLICK_AREAS, performClick } = dependencies;
  updateCurrentFunction('scrollUp'); // Update current function
  
  // Add 200ms delay at start to ensure previous scroll operations are fully complete
  const startTime = Date.now();
  console.log(`DEBUG: scrollUp - Function called at ${startTime}, waiting 200ms before starting...`);
  await new Promise(resolve => setTimeout(resolve, 200));
  console.log(`DEBUG: scrollUp - 200ms delay completed at ${Date.now()}, beginning scroll operation`);
  
  try {
    console.log(`DEBUG: scrollUp - Starting at X:${x}, Y:${y}`);
    // 1. Move mouse to start point
    robot.moveMouse(x, y);
    await new Promise(resolve => setTimeout(resolve, 50)); 
    console.log(`DEBUG: scrollUp - Mouse moved to X:${x}, Y:${y}`);

    // Click off before scrolling up
    console.log(`DEBUG: scrollUp - Clicking off at X:${CLICK_AREAS.CLICK_OFF.x}, Y:${CLICK_AREAS.CLICK_OFF.y}`);
    await performClick(CLICK_AREAS.CLICK_OFF.x, CLICK_AREAS.CLICK_OFF.y);
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay after click off
    console.log(`DEBUG: scrollUp - Click off completed.`);

    // Re-adjust mouse to scroll start point after click off
    const scrollDistance = 200; // Fixed 200 pixel scroll distance
    const startY = y - scrollDistance / 2;
    const endY = y + scrollDistance / 2;
    
    robot.moveMouse(x, startY);
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`DEBUG: scrollUp - Mouse positioned at X:${x}, Y:${startY} for smooth drag.`);

    // 2. Press and hold left mouse button
    robot.mouseToggle('down', 'left');
    await new Promise(resolve => setTimeout(resolve, 100)); 
    console.log(`DEBUG: scrollUp - Mouse button down.`);

    // 3. Perform smooth drag with easing for natural scrolling
    const duration = 400; // Longer duration for smoother gesture
    const steps = 40; // More steps for smoother motion
    const stepDelay = duration / steps;
    console.log(`DEBUG: scrollUp - Performing smooth scroll up 200px over ${duration}ms`);
    
    // Use easing function for natural touch-like movement
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const easedProgress = easeOutCubic(progress);
      const currentY = startY + (endY - startY) * easedProgress;
      
      robot.dragMouse(x, currentY);
      await new Promise(resolve => setTimeout(resolve, stepDelay));
    }
    
    console.log(`DEBUG: scrollUp - Smooth scroll drag completed over ${duration}ms.`);

    // 4. Release left mouse button
    robot.mouseToggle('up', 'left');
    console.log(`DEBUG: scrollUp - Mouse button up.`);
    
    // Add final delay to ensure scroll operation completes before function returns
    await new Promise(resolve => setTimeout(resolve, 500));
    const endTime = Date.now();
    console.log(`DEBUG: scrollUp - Operation completed successfully at ${endTime} (total duration: ${endTime - startTime}ms)`);
    
    return { success: true };
  } catch (error) {
    console.error(`Error executing RobotJS scroll up: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function scrollToBottom(x, y, distance, count, dependencies) { // Accept dependencies
  const { updateCurrentFunction, performClick, CLICK_AREAS } = dependencies; // Destructure new dependencies
  updateCurrentFunction('scrollToBottom'); // Update current function
  
  try {
    // Perform 10 scrolls of 300px each (3000px total)
    const scrollCount = 10;
    const scrollDistance = 300;
    console.log(`DEBUG: scrollToBottom - Performing ${scrollCount} scrolls of ${scrollDistance}px each from X:${x}, Y:${y}`);
    
    for (let i = 0; i < scrollCount; i++) {
      robot.moveMouse(x, y);
      await new Promise(resolve => setTimeout(resolve, 50));
      robot.mouseToggle('down', 'left');
      await new Promise(resolve => setTimeout(resolve, 50));
      robot.dragMouse(x, y - scrollDistance); // Drag upwards to scroll down
      await new Promise(resolve => setTimeout(resolve, 50));
      robot.mouseToggle('up', 'left');
      
      // Small delay between scrolls
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log(`DEBUG: scrollToBottom - Completed scroll ${i + 1}/${scrollCount} (${scrollDistance}px)`);
    }

    // After scrolling to bottom, perform a single click at the "click off" location
    if (CLICK_AREAS && CLICK_AREAS.CLICK_OFF) {
        await performClick(CLICK_AREAS.CLICK_OFF.x, CLICK_AREAS.CLICK_OFF.y);
        console.log('DEBUG: Clicked off after scrolling to bottom.');
    }
    return { success: true };
  } catch (error) {
    console.error(`Error executing scrollToBottom: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function scrollToTop(dependencies) {
  const { updateCurrentFunction, performClick, CLICK_AREAS, iphoneMirroringRegion } = dependencies;
  updateCurrentFunction('scrollToTop');
  
  // Use region-based coordinates instead of hardcoded values
  const region = iphoneMirroringRegion || { x: 0, y: 100, width: 450, height: 900 }; // fallback to default
  const middleX = region.x + region.width / 2;
  const startY = region.y + region.height / 2;

  try {
    // Perform 10 scrolls of 300px each (3000px total)
    const scrollCount = 10;
    const scrollDistance = 300;
    
    console.log(`DEBUG: scrollToTop - Performing ${scrollCount} scrolls of ${scrollDistance}px each from center of region X:${middleX}, Y:${startY}`);
    
    for (let i = 0; i < scrollCount; i++) {
      robot.moveMouse(middleX, startY);
      await new Promise(resolve => setTimeout(resolve, 50));
      robot.mouseToggle('down', 'left');
      await new Promise(resolve => setTimeout(resolve, 50));
      robot.dragMouse(middleX, startY + scrollDistance); // Drag downwards to scroll up
      await new Promise(resolve => setTimeout(resolve, 50));
      robot.mouseToggle('up', 'left');
      
      // Small delay between scrolls
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log(`DEBUG: scrollToTop - Completed scroll ${i + 1}/${scrollCount}`);
    }

    if (CLICK_AREAS && CLICK_AREAS.CLICK_OFF) {
      await performClick(CLICK_AREAS.CLICK_OFF.x, CLICK_AREAS.CLICK_OFF.y);
      console.log('DEBUG: Clicked off after scrolling to top.');
    }
    return { success: true };
  } catch (error) {
    console.error(`Error executing scrollToTop: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getRandomInt,
  scrollDown,
  scrollUp,
  scrollToBottom,
  scrollToTop, // Export the new function
};
