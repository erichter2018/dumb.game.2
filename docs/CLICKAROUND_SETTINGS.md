# Click Around Settings Documentation

## Overview
Click Around is an automation that systematically clicks through the screen in a grid pattern to activate buildings/items.

## Complete Process Flow

### **Phase 1: Initial Positioning (Scroll UP)**
```
Scroll UP by [scrollUpDistance] pixels
Repeat [scrollUpCount] times
```
**Purpose**: Move toward the top of the screen from current position

**Example**: 
- scrollUpDistance: 200px
- scrollUpCount: 5
- Result: Scrolls up 5 times, 200px each (1000px total upward)

### **Phase 2: Adjust Starting Position (Scroll DOWN)**
```
Scroll DOWN by [initialScrollDown] pixels (once)
```
**Purpose**: Fine-tune the starting position after scrolling up

**Example**:
- initialScrollDown: 150px
- Result: Scrolls down 150px once

**Note**: If initialScrollDown = 0, this step is skipped

### **Phase 3: Click Chunks**
```
Repeat [clickaroundChunks] times:
  1. Detect red blobs (if excludeRedBlobs is enabled)
  2. Generate grid of click positions on current screen
  3. Filter out exclusion zones (top/bottom borders, left/right edges)
  4. Filter out positions near red blobs (if enabled)
  5. Click all valid positions in optimized batch
  6. Scroll DOWN 350 pixels (hardcoded)
```

**Purpose**: Systematically click through multiple screens

**Example**:
- clickaroundChunks: 2
- Result: Creates 2 "chunks" of clicks, scrolling 350px down between them

**Grid Details**:
- Cell size: Random between 27-31 pixels (both X and Y)
- Exclusion zones:
  - Top: Y < 450 (absolute screen Y)
  - Bottom: Y > 800 (absolute screen Y)
  - Left edge: 25 pixels
  - Right edge: 25 pixels
- Red blob exclusion: 250 pixel radius (if enabled)

### **Phase 4: Optional Finish (Scroll to Bottom)**
```
If [scrollToBottomAtEnd] is true:
  Scroll all the way to bottom
```

**Purpose**: Ensure we've covered the entire screen

## Settings Summary

| Setting | Description | Default | Example |
|---------|-------------|---------|---------|
| **excludeRedBlobs** | Don't click near red blobs | `true` | true |
| **clickaroundChunks** | Number of screen chunks to process | `3` | 2 |
| **scrollUpDistance** | Distance to scroll up per iteration (px) | `200` | 200 |
| **scrollUpCount** | Number of times to scroll up | `5` | 5 |
| **initialScrollDown** | Distance to scroll down after scrolling up (px) | `150` | 150 |
| **scrollToBottomAtEnd** | Scroll to bottom when finished | `true` | false |

## Complete Example Flow

**Settings**:
- excludeRedBlobs: ✓ (checked)
- clickaroundChunks: 2
- scrollUpDistance: 200px
- scrollUpCount: 5
- initialScrollDown: 150px
- scrollToBottomAtEnd: ☐ (unchecked)

**Execution**:
```
1. Click off (clean state)
2. Scroll UP 200px (repeat 5 times = 1000px up total)
3. Scroll DOWN 150px (once)
4. CHUNK 1:
   - Detect red blobs
   - Generate click grid
   - Click all valid positions
   - Scroll DOWN 350px
5. CHUNK 2:
   - Detect red blobs
   - Generate click grid
   - Click all valid positions
   - Scroll DOWN 350px
6. Done (no scroll to bottom)
```

## Bug Fix (Applied)

**Previous Bug**: The code was only scrolling UP once, not multiple times.

**Fixed**: Now correctly scrolls up `scrollUpCount` times by `scrollUpDistance` pixels each.

**Code Change**:
```javascript
// OLD (WRONG):
await scrollUpWithDistance(..., config.scrollUpDistance); // Only once!

// NEW (CORRECT):
for (let i = 0; i < config.scrollUpCount; i++) {
  await scrollUpWithDistance(..., config.scrollUpDistance);
}
```

## Hardcoded Values

These values are intentionally hardcoded and should NOT be changed via settings:

1. **Scroll between chunks**: 350 pixels (line 217)
2. **Red blob exclusion radius**: 250 pixels (line 67)
3. **Grid cell size**: Random 27-31 pixels (lines 84-85)
4. **Exclusion zones**: See "Grid Details" above

