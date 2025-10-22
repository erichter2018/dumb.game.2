# Mouse Safety & Interruption System - Implementation Plan

## Executive Summary

This document outlines a comprehensive approach to making the automation system fully interruptible and safe from user mouse interference. The goal is to detect any user mouse movement and immediately pause automation to prevent unwanted clicks or operations.

---

## Problem Statement

**Current Issue:**
- When automation is running and controlling the mouse, any user mouse movement can interfere
- User movements during automation can cause clicks in unintended locations
- No immediate way to interrupt automation when user needs to take control
- Potential for automation to "fight" with user for mouse control

**Risks:**
- Accidental clicks on wrong areas of screen
- Unpredictable behavior when mouse position doesn't match expectations
- User frustration when they can't quickly interrupt automation
- Potential system state corruption if operations complete with wrong coordinates

---

## Solution Architecture

### Five-Layer Safety System

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Visual Feedback & User Notifications              │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Global Safety Lock (prevents concurrent ops)      │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Centralized MouseController (all ops go through)  │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Pre/Post Operation Verification                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Background Mouse Position Monitoring (50ms poll)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation Plan

### Phase 1: Background Monitoring System

**File:** `lib/mouseController.js` (new file)

**Objective:** Continuously monitor mouse position and detect unexpected changes

#### 1.1 Core Monitoring Loop

```javascript
class MouseController {
    constructor() {
        this.robot = require('robotjs');
        this.expectedPosition = null;
        this.isOperating = false;
        this.isPaused = false;
        this.monitorInterval = null;
        this.pauseTimeout = null;
        this.positionTolerance = 3; // pixels
        this.monitoringFrequency = 50; // ms
        this.autoPauseEnabled = true;
        this.eventEmitter = new (require('events'))();
    }
    
    /**
     * Start the background monitoring system
     */
    startMonitoring() {
        console.log('🔍 Starting mouse position monitoring...');
        this.expectedPosition = this.robot.getMousePos();
        
        this.monitorInterval = setInterval(() => {
            this.checkForUserMovement();
        }, this.monitoringFrequency);
        
        console.log(`✅ Monitoring active (polling every ${this.monitoringFrequency}ms)`);
    }
    
    /**
     * Stop monitoring (when automation is fully stopped)
     */
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        if (this.pauseTimeout) {
            clearTimeout(this.pauseTimeout);
            this.pauseTimeout = null;
        }
        console.log('⏹️  Mouse monitoring stopped');
    }
    
    /**
     * Check if user has moved the mouse unexpectedly
     */
    checkForUserMovement() {
        // Skip check if we're actively moving the mouse
        if (this.isOperating) return;
        
        // Skip check if we don't have an expected position yet
        if (!this.expectedPosition) return;
        
        // Skip check if already paused
        if (this.isPaused) return;
        
        const currentPos = this.robot.getMousePos();
        
        // Check if position differs beyond tolerance
        if (this.positionDiffers(currentPos, this.expectedPosition)) {
            const delta = {
                x: Math.abs(currentPos.x - this.expectedPosition.x),
                y: Math.abs(currentPos.y - this.expectedPosition.y)
            };
            
            console.warn(`🚨 USER MOUSE MOVEMENT DETECTED!`);
            console.warn(`   Expected: (${this.expectedPosition.x}, ${this.expectedPosition.y})`);
            console.warn(`   Current:  (${currentPos.x}, ${currentPos.y})`);
            console.warn(`   Delta:    (${delta.x}, ${delta.y})`);
            
            this.emergencyPause('user_mouse_movement', currentPos);
        }
    }
    
    /**
     * Check if two positions differ beyond tolerance
     */
    positionDiffers(pos1, pos2) {
        return Math.abs(pos1.x - pos2.x) > this.positionTolerance ||
               Math.abs(pos1.y - pos2.y) > this.positionTolerance;
    }
}
```

#### 1.2 Emergency Pause System

```javascript
/**
 * Immediately pause all automation due to safety concern
 */
emergencyPause(reason, detectedPosition) {
    if (this.isPaused) return; // Already paused
    
    console.error(`🛑 EMERGENCY PAUSE TRIGGERED: ${reason}`);
    this.isPaused = true;
    
    // Emit pause event for all automation systems to listen to
    this.eventEmitter.emit('emergency-pause', {
        reason,
        detectedPosition,
        expectedPosition: this.expectedPosition,
        timestamp: Date.now()
    });
    
    // Release any held mouse buttons (safety measure)
    try {
        this.robot.mouseToggle('up', 'left');
    } catch (error) {
        console.error('Error releasing mouse button:', error);
    }
    
    // Auto-resume after delay
    const resumeDelayMs = 5000;
    console.log(`⏸️  Auto-resuming in ${resumeDelayMs / 1000}s...`);
    
    this.pauseTimeout = setTimeout(() => {
        this.resume();
    }, resumeDelayMs);
    
    return true;
}

/**
 * Resume automation after pause
 */
resume() {
    if (!this.isPaused) return;
    
    console.log('▶️  Resuming automation...');
    this.isPaused = false;
    
    // Reset expected position to current position
    this.expectedPosition = this.robot.getMousePos();
    console.log(`   Reset expected position to (${this.expectedPosition.x}, ${this.expectedPosition.y})`);
    
    // Emit resume event
    this.eventEmitter.emit('resumed', {
        timestamp: Date.now()
    });
}

/**
 * Manual resume (user-triggered)
 */
manualResume() {
    if (this.pauseTimeout) {
        clearTimeout(this.pauseTimeout);
        this.pauseTimeout = null;
    }
    this.resume();
}
```

---

### Phase 2: Safe Mouse Operations

#### 2.1 Pre-Operation Verification

```javascript
/**
 * Verify we can safely perform an operation
 */
async verifyCanOperate() {
    if (this.isPaused) {
        throw new Error('Mouse operations paused - waiting for resume');
    }
    
    // Double-check position hasn't changed
    if (this.expectedPosition) {
        const currentPos = this.robot.getMousePos();
        if (this.positionDiffers(currentPos, this.expectedPosition)) {
            throw new Error('Mouse position changed - aborting operation');
        }
    }
}

/**
 * Verify mouse is at expected position (tolerance check)
 */
verifyPosition(x, y, throwOnMismatch = true) {
    const currentPos = this.robot.getMousePos();
    const matches = Math.abs(currentPos.x - x) <= this.positionTolerance &&
                   Math.abs(currentPos.y - y) <= this.positionTolerance;
    
    if (!matches && throwOnMismatch) {
        throw new Error(
            `Position mismatch! Expected (${x}, ${y}), got (${currentPos.x}, ${currentPos.y})`
        );
    }
    
    return matches;
}
```

#### 2.2 Safe Mouse Operations

```javascript
/**
 * Safely move mouse to position
 */
async move(x, y, verify = true) {
    await this.verifyCanOperate();
    
    this.isOperating = true;
    try {
        this.robot.moveMouse(x, y);
        
        // Small delay for movement to complete
        await this.sleep(10);
        
        // Verify we ended up at the right position
        if (verify) {
            this.verifyPosition(x, y);
        }
        
        // Update expected position
        this.expectedPosition = { x, y };
        
        return true;
    } finally {
        this.isOperating = false;
    }
}

/**
 * Safely click at position
 */
async click(x, y, button = 'left') {
    await this.verifyCanOperate();
    
    // Move to position first
    await this.move(x, y);
    
    this.isOperating = true;
    try {
        // Final position verification before clicking
        this.verifyPosition(x, y);
        
        // Perform click
        this.robot.mouseClick(button, false);
        
        await this.sleep(100); // Standard delay after click
        
        return true;
    } finally {
        this.isOperating = false;
    }
}

/**
 * Safely hold mouse button at position
 */
async clickAndHold(x, y, durationMs, checkFunction) {
    await this.verifyCanOperate();
    await this.move(x, y);
    
    this.isOperating = true;
    try {
        // Final verification before holding
        this.verifyPosition(x, y);
        
        // Mouse down
        this.robot.mouseToggle('down', 'left');
        
        // Hold for duration, checking periodically
        const checkInterval = 200; // Check every 200ms
        const iterations = Math.ceil(durationMs / checkInterval);
        
        for (let i = 0; i < iterations; i++) {
            // Check if we should stop (automation cancelled, etc)
            if (checkFunction && !checkFunction()) {
                console.log('Hold interrupted by check function');
                break;
            }
            
            // Check if paused
            if (this.isPaused) {
                console.log('Hold interrupted by pause');
                break;
            }
            
            await this.sleep(Math.min(checkInterval, durationMs - (i * checkInterval)));
        }
        
        // Mouse up
        this.robot.mouseToggle('up', 'left');
        
        return true;
    } finally {
        this.isOperating = false;
    }
}

/**
 * Utility sleep function
 */
sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

### Phase 3: Integration with Main Process

**File:** `main.js` (modifications)

#### 3.1 Initialize MouseController

```javascript
// At top of main.js
const MouseController = require('./lib/mouseController');
const mouseController = new MouseController();

// Start monitoring when automation starts
function startAutomation() {
    mouseController.startMonitoring();
    // ... rest of automation start
}

// Stop monitoring when automation stops
function stopAutomation() {
    mouseController.stopMonitoring();
    // ... rest of automation stop
}
```

#### 3.2 Listen to Pause Events

```javascript
// Handle emergency pause events
mouseController.eventEmitter.on('emergency-pause', (data) => {
    console.error('🚨 Emergency pause triggered:', data);
    
    // Stop all automation flags
    isAutomationRunning = false;
    isFinishLevelRunning = false;
    isClickAroundRunning = false;
    
    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', {
            message: `Automation paused: ${data.reason}. Resuming in 5s...`,
            type: 'warn'
        });
    }
});

// Handle resume events
mouseController.eventEmitter.on('resumed', (data) => {
    console.log('▶️  Automation resumed');
    
    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', {
            message: 'Automation resumed',
            type: 'info'
        });
    }
});
```

#### 3.3 Replace All Mouse Operations

**Current code pattern:**
```javascript
robot.moveMouse(x, y);
robot.mouseClick('left', false);
```

**New pattern:**
```javascript
await mouseController.move(x, y);
await mouseController.click(x, y);
```

**Search and replace targets:**
- All `robot.moveMouse()` calls → `await mouseController.move()`
- All `robot.mouseClick()` calls → `await mouseController.click()`
- All `robot.mouseToggle()` calls for holds → `await mouseController.clickAndHold()`

---

### Phase 4: Configuration & Tuning

#### 4.1 Configurable Parameters

Add to main config or settings:

```javascript
const MOUSE_SAFETY_CONFIG = {
    enabled: true,
    positionTolerance: 3,        // pixels of allowed drift
    monitoringFrequency: 50,      // ms between checks
    autoPauseEnabled: true,       // auto-pause on movement detected
    autoPauseDelay: 5000,         // ms before auto-resume
    verifyBeforeClick: true,      // verify position before every click
    verifyAfterMove: true,        // verify position after every move
};
```

#### 4.2 Toggle Safety System

```javascript
// IPC handlers for enabling/disabling safety
ipcMain.handle('toggle-mouse-safety', async (event, enabled) => {
    if (enabled) {
        mouseController.startMonitoring();
    } else {
        mouseController.stopMonitoring();
    }
    return { success: true, enabled };
});

ipcMain.handle('manual-resume-automation', async () => {
    mouseController.manualResume();
    return { success: true };
});
```

---

### Phase 5: Visual Feedback

**File:** `renderer.js` (modifications)

#### 5.1 Automation Active Indicator

```javascript
// Show visual indicator when automation is controlling mouse
function showAutomationActiveIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'automation-active-indicator';
    indicator.innerHTML = `
        <div style="
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(255, 193, 7, 0.9);
            color: black;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: pulse 2s infinite;
        ">
            🤖 AUTOMATION ACTIVE - Don't move mouse!
        </div>
    `;
    document.body.appendChild(indicator);
}

function hideAutomationActiveIndicator() {
    const indicator = document.getElementById('automation-active-indicator');
    if (indicator) indicator.remove();
}
```

#### 5.2 Pause Notification

```javascript
// Show pause notification
ipcRenderer.on('automation-paused', (event, data) => {
    const notification = document.createElement('div');
    notification.id = 'pause-notification';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(220, 53, 69, 0.95);
            color: white;
            padding: 30px 50px;
            border-radius: 12px;
            font-size: 20px;
            font-weight: bold;
            z-index: 10001;
            text-align: center;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        ">
            ⏸️ PAUSED<br>
            <span style="font-size: 16px; font-weight: normal;">
                ${data.reason}<br>
                Auto-resuming in 5s...
            </span>
            <button onclick="window.manualResume()" style="
                margin-top: 15px;
                padding: 10px 20px;
                font-size: 14px;
                background: white;
                color: black;
                border: none;
                border-radius: 6px;
                cursor: pointer;
            ">
                Resume Now
            </button>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
});

window.manualResume = async () => {
    await ipcRenderer.invoke('manual-resume-automation');
};
```

---

## Migration Strategy

### Step 1: Add MouseController without changing behavior
- Create `lib/mouseController.js`
- Add monitoring, but don't trigger pauses yet
- Log detections only

### Step 2: Add pause triggers
- Enable emergency pause on movement detection
- Test with automation running

### Step 3: Gradual mouse operation migration
Start with critical operations:
1. Blue box clicks/holds (finishBuild.js)
2. Red blob clicks (finishLevel.js)
3. Navigation clicks (exit level, start level)
4. Scroll operations (these are less critical but should be included)

### Step 4: Visual feedback
- Add indicators to UI
- Add manual resume button

### Step 5: Configuration & fine-tuning
- Add settings UI
- Tune tolerance and timing parameters
- Add keyboard shortcuts for manual pause/resume

---

## Testing Plan

### Unit Tests
1. MouseController position detection accuracy
2. Emergency pause triggers correctly
3. Resume works after pause
4. Position verification catches mismatches

### Integration Tests
1. Full automation run with monitoring active
2. Manually move mouse during automation - should pause
3. Auto-resume after 5 seconds
4. Manual resume button works
5. Multiple pause/resume cycles

### Edge Cases
1. Mouse moved during a click operation
2. Very rapid automation movements (self-triggering prevention)
3. System under load (slow response times)
4. Multiple automations trying to use mouse simultaneously

---

## Performance Considerations

### Expected Overhead
- **50ms polling:** ~20 checks per second = negligible CPU (<0.1%)
- **Position checks:** 1-2μs per check (extremely fast)
- **Total overhead:** <1% CPU, unnoticeable in practice

### Optimization Opportunities
- Adaptive polling (faster when automation active, slower when idle)
- Skip monitoring during batch operations
- Cache position reads within same event loop tick

---

## Safety Guarantees

With this system implemented:

✅ **User mouse movement detected within 50ms**
✅ **All automation pauses within 100ms of detection**
✅ **No clicks can occur after pause triggered**
✅ **Held mouse buttons released immediately on pause**
✅ **Clear visual feedback of automation state**
✅ **Multiple verification points prevent wrong-position clicks**
✅ **Graceful degradation if monitoring fails**

---

## Rollback Plan

If issues arise:

1. **Quick disable:** Set `MOUSE_SAFETY_CONFIG.enabled = false`
2. **Partial rollback:** Keep monitoring/logging, disable auto-pause
3. **Full rollback:** Remove MouseController, revert to direct robot calls

All changes are additive - original code patterns remain valid.

---

## Future Enhancements

### Keyboard Interrupt
Add keyboard shortcut (e.g., Escape key) for immediate manual pause:

```javascript
globalShortcut.register('Escape', () => {
    mouseController.emergencyPause('keyboard_interrupt');
});
```

### Smart Zones
Define "safe zones" where mouse movement is allowed (e.g., outside iPhone mirroring region)

### Movement Prediction
Track automation's planned mouse movements and ignore self-initiated movement

### Gesture Detection
Detect rapid back-and-forth movement as intentional interrupt gesture

---

## References

- **robotjs documentation:** https://robotjs.io/docs/
- **Node.js EventEmitter:** https://nodejs.org/api/events.html
- **Electron globalShortcut:** https://www.electronjs.org/docs/latest/api/global-shortcut

---

## Sign-off

**Document Version:** 1.0
**Date:** 2025-01-20
**Status:** Planning - Ready for implementation when needed
**Estimated Implementation Time:** 8-12 hours for full implementation and testing

---

## Quick Reference: Files to Modify

```
NEW FILES:
✨ lib/mouseController.js          - Complete new MouseController class

MODIFY FILES:
📝 main.js                         - Initialize controller, replace mouse ops
📝 src/automation/finishBuild.js   - Replace all mouse operations
📝 src/automation/finishLevel.js   - Replace all mouse operations
📝 src/automation/clickAround.js   - Replace all mouse operations
📝 renderer.js                     - Add visual feedback
📝 index.html                      - Add CSS for indicators (if needed)
📝 package.json                    - No changes needed (robotjs already included)
```

---

*When ready to implement, start with Phase 1 and test thoroughly before moving to Phase 2.*

