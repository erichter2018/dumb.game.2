# Diagnostic Logging Summary

## Changes Made (build_optimization branch)

Added minimal, focused logging to help diagnose MAX build detection issues without bloating log files.

## New Log Lines

### 1. Box Summary Line (ONE line per box)
```
DEBUG: [BOX SUMMARY] Box at x:251, y:436 - Avg RGB(125,130,128), Circle:true, WhiteText:true, RedText:false, isGrey:false
```

**What it shows:**
- Box position
- Average RGB values of the entire box
- Whether a circle was detected (true/false)
- Whether white text was detected (true/false)
- Whether red text was detected (true/false)
- Whether the box passed the `isGrey()` check (true/false)

**Why it's useful:**
- Single line shows all key decision factors
- Can quickly see if grey detection is failing (isGrey:false when RGB values look grey)
- Can correlate circle detection with box color

### 2. White Pixel Percentage in Circles
```
DEBUG: [RED CIRCLE] hasRedOrangeCircle set to TRUE (pixels: 326, ratio: 0.95, whitePixels: 280/326 = 85.9%)
```

**What it shows:**
- Total pixels in detected "circle"
- Aspect ratio of the circle
- **NEW**: How many of those pixels are actually white (R>200, G>200, B>200)
- Percentage of white pixels

**Why it's useful:**
- If whitePixels % is high (>50%), the "circle" is likely white "MAX" text
- If whitePixels % is low (<20%), it's likely a real yellow/orange circle
- This will help us identify false positives

## What to Look For

When MAX build detection fails, look for:

1. **Box Summary shows `isGrey:false` but RGB values look grey** (e.g., RGB(125,130,128))
   - This means `isGrey()` function is too strict
   - Should be: R, G, B all similar and in range ~100-160

2. **Circle detection shows high white pixel percentage** (>50%)
   - This means white "MAX" text is being misidentified as a circle
   - Should add exclusion: if whitePixels > 50%, reject the circle

3. **Box Summary shows `Circle:true` on a MAX build**
   - Combined with high white pixel %, confirms false positive

## Next Steps

After collecting data from a few runs where MAX build fails:
1. Review the [BOX SUMMARY] lines for those boxes
2. Check if `isGrey` is returning false when it should be true
3. Check if white pixel % is high in detected circles
4. Adjust thresholds based on actual data, not guesses

## Log File Size Impact

- Added: 2 lines per box (BOX SUMMARY + modified RED CIRCLE line)
- Typical run: 5-20 boxes detected = 10-40 extra lines
- Minimal impact compared to existing ~3000-4000 lines per level

