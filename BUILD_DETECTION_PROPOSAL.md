# Build Box Detection Optimization Proposal

## Current Problem

The blue box detector is incorrectly classifying MAX build boxes as blue_build boxes. This causes the automation to continue building after reaching MAX, leading to infinite loops.

## Three Box Types (Clarified)

1. **Blue Build Box** (Active building that can be upgraded)
   - Color: **Blue**
   - Text: **White** (shows cost/time, changes)
   - Circle: **Yellow/Orange** circle present

2. **Grey Build Box** (Building that can still be upgraded but is in grey state)
   - Color: **Grey**
   - Text: **RED** (shows cost/time, changes)
   - Circle: **Yellow/Orange** circle present
   - **Treatment: Should be treated EXACTLY like a blue_build box**

3. **MAX Build Box** (Building at maximum level)
   - Color: **Grey**
   - Text: **White** word "MAX"
   - Circle: **NO yellow/orange circle**

## Root Cause Analysis

Looking at the log output, the detector is:
1. Finding yellow/orange circles on MAX build boxes (FALSE POSITIVE)
   - Log shows: `Red/Orange Circle detected - currentBlobPixels: 326-329`
   - This is likely detecting the white "MAX" text as orange
2. The `isGrey()` check is failing to recognize grey boxes
3. Decision logic prioritizes red/orange circle detection over grey detection

## Proposed Solution

### Step 1: Fix the Detection Order
**Current logic:**
```
if (greenPixelDensity > threshold) → green_excluded
else if (isGrey(averageColor)) → grey_max/grey_build/other_grey
else if (hasRedOrangeCircle && hasWhiteText) → blue_build
else → unknown
```

**Problem:** If `isGrey()` fails, a grey box with false-positive circle detection becomes blue_build

**Proposed logic:**
```
1. Calculate grey-ness of the ENTIRE box first (more reliable)
2. If box is grey:
   - Check for yellow/orange circle
   - If circle exists:
     - Check text color (red vs white)
     - If RED text → grey_build (treat as blue_build)
     - If WHITE text → grey_max
   - If NO circle:
     - grey_max (this is the MAX build box)
3. If box is blue:
   - Must have yellow/orange circle AND white text → blue_build
4. If neither grey nor blue → unknown
```

### Step 2: Improve Grey Detection

**Current `isGrey()` function:**
- Checks: `saturation < 25`, `value 40-85`, RGB components close (tolerance 30)
- Problem: May be too strict for in-game grey boxes

**Proposed improvements:**
1. Increase saturation threshold to `< 30` (grey boxes may have slight color)
2. Expand value range to `30-90` (account for lighting variations)
3. Add fallback: check if `max(r,g,b) - min(r,g,b) < 40` (all channels similar)

### Step 3: Fix Yellow/Orange Circle Detection

**Current `isRedOrange()` function:**
- Checks: hue 20-90°, saturation > 40, value > 40
- **OR** RGB gold check: `r > 150, g > 100, b < 100`

**Problem:** White text can trigger false positives

**Proposed improvements:**
1. **Exclude white pixels:** Add check `if (r > 200 && g > 200 && b > 200) return false`
2. **Tighten hue range:** Yellow/orange should be 30-60° (more specific)
3. **Increase saturation requirement:** Require `s > 50` (circles are vivid)
4. **Add size validation:** After BFS, reject circles that are too large (white text blobs)

### Step 4: Improve Red Text Detection

**Current `isRedText()` function:**
- Hue: 0-10° or 350-360°, saturation > 60, value > 60
- RGB: `r > g + 30` and `r > b + 30`

**Proposed improvements:**
1. Already looks good, but add logging to verify it works
2. May need to adjust saturation threshold based on testing

## Implementation Plan

### Phase 1: Diagnostic Logging (FIRST)
Before changing logic, add comprehensive logging:
1. Log the average RGB values of the entire box
2. Log whether `isGrey()` returns true/false for each box
3. Log the size/dimensions of detected "circles"
4. Log whether white pixels are being detected as orange

### Phase 2: Grey Detection Fix
1. Update `isGrey()` function with relaxed thresholds
2. Add fallback grey detection method
3. Test on known grey boxes

### Phase 3: Circle Detection Fix
1. Add white pixel exclusion to `isRedOrange()`
2. Add size validation after BFS (reject oversized "circles")
3. Tighten hue and saturation requirements

### Phase 4: Logic Reordering
1. Move grey detection to be PRIMARY check
2. Within grey detection, check for circle presence
3. Use circle + text color to determine grey_build vs grey_max

### Phase 5: Final Classification
Ensure the final decision tree is:
```
Is box grey?
  ├─ YES: Does it have yellow/orange circle?
  │   ├─ YES: What color is the text?
  │   │   ├─ RED → grey_build (treat as blue_build)
  │   │   └─ WHITE → check if circle is valid
  │   │       ├─ Valid circle → grey_build
  │   │       └─ No circle (false positive) → grey_max
  │   └─ NO: → grey_max (this is MAX!)
  └─ NO: Is box blue?
      ├─ YES: Has circle AND white text?
      │   ├─ YES → blue_build
      │   └─ NO → unknown
      └─ NO: → unknown
```

## Testing Strategy

1. **Test Case 1:** MAX build box (grey, white "MAX", no circle)
   - Expected: `grey_max`
   
2. **Test Case 2:** Grey build box (grey, red text, circle)
   - Expected: `grey_build`
   
3. **Test Case 3:** Blue build box (blue, white text, circle)
   - Expected: `blue_build`

4. **Edge Cases:**
   - Box during transition (blue → grey)
   - Box with partial visibility
   - Box with unusual lighting

## Success Criteria

- MAX build boxes consistently detected as `grey_max`
- Automation stops after MAX build instead of continuing
- No false positives on white text being detected as circles
- Grey build boxes correctly treated as buildable (like blue_build)

## Rollback Plan

If detection becomes less reliable:
1. Revert to previous detection logic
2. Keep diagnostic logging
3. Collect more sample images for analysis

