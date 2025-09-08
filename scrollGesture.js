const robot = require('robotjs');

/**
 * JavaScript replacement for scrollGesture.applescript
 * Uses robotjs instead of cliclick for mouse operations
 */
async function performScrollGesture(startX, startY, endX, endY) {
  try {
    // Activate iPhone Mirroring app (equivalent to AppleScript's activate)
    const { execAsync } = require('util').promisify(require('child_process').exec);
    await execAsync(`osascript -e 'tell application "iPhone Mirroring" to activate'`);
    
    // Move to starting position
    robot.moveMouse(startX, startY);
    
    // Mouse down using robotjs (replaces cliclick dd)
    robot.mouseToggle('down', 'left');
    
    // Pause to ensure the click is registered
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Move to ending position (drag)
    robot.dragMouse(endX, endY);
    
    // Pause to ensure the drag is registered
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Mouse up using robotjs (replaces cliclick du)
    robot.mouseToggle('up', 'left');
    
    return { success: true };
  } catch (error) {
    console.error('Error performing scroll gesture:', error);
    // Ensure mouse button is released even on error
    try {
      robot.mouseToggle('up', 'left');
    } catch (releaseError) {
      console.error('Error releasing mouse button:', releaseError);
    }
    return { success: false, error: error.message };
  }
}

module.exports = { performScrollGesture };
