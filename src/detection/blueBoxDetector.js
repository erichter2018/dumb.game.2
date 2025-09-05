const sharp = require('sharp');

// Helper to convert RGB to HSV
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h, s, v = max;

    let d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }

    return { h: h * 360, s: s * 100, v: v * 100 };
}

async function detect(imageDataUrl, captureRegion) {
    const detections = [];

    try {
        console.log('Detecting blue boxes with Sharp...', { captureRegion });

        const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '');
        const fullScreenImage = sharp(Buffer.from(base64Data, 'base64'));
        const fullScreenMetadata = await fullScreenImage.metadata();

        if (fullScreenMetadata.width === 0 || fullScreenMetadata.height === 0) {
            console.error('Error: Full screen image has zero width or height.', fullScreenMetadata);
            return [];
        }

        const effectiveRegion = {
            left: captureRegion.x,
            top: captureRegion.y,
            width: captureRegion.width,
            height: captureRegion.height,
        };

        // Extract the effective region once and work with this smaller image
        const croppedEffectiveImageBuffer = await fullScreenImage.extract(effectiveRegion).raw().toBuffer({ resolveWithObject: true });
        const { data, info } = croppedEffectiveImageBuffer;

        // Define blue box size expectations
        const boxWidthMin = 140; // Allow some tolerance for 160
        const boxWidthMax = 180; // Allow some tolerance for 160
        const boxHeightMin = 50; // Allow some tolerance for 60
        const boxHeightMax = 70; // Allow some tolerance for 60
        const greenPixelThreshold = 0.10; // Max 10% green pixels allowed for a non-green box
        const detectedBoxes = [];

        const visited = new Set();

        function getPixel(x, y) {
            if (x < 0 || x >= info.width || y < 0 || y >= info.height) return null;
            const idx = (info.width * y + x) * info.channels;
            return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
        }

        function isBlue(pixel) {
            const { r, g, b } = pixel;
            const hsv = rgbToHsv(r, g, b);
            
            // Modified to be more lenient, allowing initial detection of grey-ish tones
            // This will ensure grey boxes are picked up by connected components
            const isGenerallyNotRed = !isRedOrange(pixel);
            const isSaturatedEnough = hsv.s < 30; // Even lower saturation to catch grey more broadly
            const isBrightEnough = hsv.v > 20 && hsv.v < 90; // Broader brightness range for grey

            // Original blue conditions (can be used for specific blue confirmation later)
            const isHueBlue = (hsv.h >= 180 && hsv.h <= 260); 
            const isClearlyBlue = b > r + 10 && b > g + 10; 

            // Prioritize grey-ish tones for initial detection, or clearly blue
            return (isGenerallyNotRed && isSaturatedEnough && isBrightEnough) || (isHueBlue && isClearlyBlue); 
        }

        function isRedOrange(pixel) {
            const { r, g, b } = pixel;
            const hsv = rgbToHsv(r, g, b);

            // DEBUG: Log pixel data for red/orange detection
            console.log(`DEBUG: isRedOrange check for RGB(${r},${g},${b}) HSV(${hsv.h.toFixed(0)},${hsv.s.toFixed(0)},${hsv.v.toFixed(0)})`);

            const isHueRedOrange = (hsv.h >= 20 && hsv.h <= 90); // Adjusted hue range for gold/orange
            const isRedOrangeSufficientlySaturated = hsv.s > 40; // Adjusted saturation for gold
            const isRedOrangeSufficientlyBright = hsv.v > 40; // Adjusted brightness for gold

            // New: RGB-based check for gold/orange
            const isRGBSufficientlyGold = r > 150 && g > 100 && b < 100 && Math.abs(r - g) < 80;

            return (isHueRedOrange && isRedOrangeSufficientlySaturated && isRedOrangeSufficientlyBright) || isRGBSufficientlyGold;
        }

        function isGrey(pixel) {
            const { r, g, b } = pixel;
            // More robust grey check: lower saturation, medium brightness, R, G, B values are close
            const hsv = rgbToHsv(r, g, b);
            const tolerance = 30; // Increased tolerance for RGB closeness
            return hsv.s < 25 && hsv.v > 40 && hsv.v < 85 && 
                   Math.abs(r - g) < tolerance && Math.abs(r - b) < tolerance && Math.abs(g - b) < tolerance;
        }

        function isGreen(pixel) {
            const { r, g, b } = pixel;
            const hsv = rgbToHsv(r, g, b);
            // Define a range for green hue and saturation/brightness to consider it "significant green"
            const isHueGreen = (hsv.h >= 70 && hsv.h <= 170); // Broader green hue range
            const isSaturatedGreen = hsv.s > 40; // Only consider if it's somewhat saturated
            const isBrightGreen = hsv.v > 30; // Only consider if it's somewhat bright
            return isHueGreen && isSaturatedGreen && isBrightGreen && g > r + 10 && g > b + 10; // Ensure green dominance
        }

        function isRedText(pixel) {
            const { r, g, b } = pixel;
            const hsv = rgbToHsv(r, g, b);
            // Red text typically has a high red component and low blue/green
            // Refined hue and saturation for better red text detection
            const isHueRed = (hsv.h >= 0 && hsv.h <= 10) || (hsv.h >= 350 && hsv.h <= 360); 
            const isSaturatedRed = hsv.s > 60; 
            const isBrightRed = hsv.v > 60; 
            return isHueRed && isSaturatedRed && isBrightRed && r > g + 30 && r > b + 30;
        }

        // Helper to detect if there's *any* red text within a sub-region
        async function hasRedTextInRegion(box, textDetectRegionRelative, base64Data, effectiveRegion, info) {
            const intendedTextLeft = box.x_relative_to_cropped + textDetectRegionRelative.left;
            const intendedTextTop = box.y_relative_to_cropped + textDetectRegionRelative.top;
            const intendedTextRight = intendedTextLeft + textDetectRegionRelative.width - 1;
            const intendedTextBottom = intendedTextTop + textDetectRegionRelative.height - 1;

            const clippedTextLeft = Math.max(0, intendedTextLeft);
            const clippedTextTop = Math.max(0, intendedTextTop);
            const clippedTextRight = Math.min(info.width - 1, intendedTextRight);
            const clippedTextBottom = Math.min(info.height - 1, intendedTextBottom);

            const subRegion = {
                left: clippedTextLeft,
                top: clippedTextTop,
                width: Math.max(1, clippedTextRight - clippedTextLeft + 1),
                height: Math.max(1, clippedTextBottom - clippedTextTop + 1)
            };

            if (subRegion.width <= 0 || subRegion.height <= 0) return false;

            const textCroppedBuffer = await sharp(Buffer.from(base64Data, 'base64')).extract({
                left: subRegion.left + effectiveRegion.left,
                top: subRegion.top + effectiveRegion.top,
                width: subRegion.width,
                height: subRegion.height
            }).raw().toBuffer({ resolveWithObject: true });
            const { data: textData, info: textInfo } = textCroppedBuffer;

            function getSubRegionPixel(x, y) {
                if (x < 0 || x >= textInfo.width || y < 0 || y >= textInfo.height) return null;
                const idx = (textInfo.width * y + x) * textInfo.channels;
                return { r: textData[idx], g: textData[idx + 1], b: textData[idx + 2], a: textData[idx + 3] };
            }

            for (let ty = 0; ty < textInfo.height; ty++) {
                for (let tx = 0; tx < textInfo.width; tx++) {
                    const pixel = getSubRegionPixel(tx, ty);
                    if (pixel && isRedText(pixel)) {
                        return true; // Found red text
                    }
                }
            }
            return false; // No red text found
        }

        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const key = `${x},${y}`;
                if (visited.has(key)) {
                    continue;
                }

                const pixel = getPixel(x, y);
                if (pixel && isBlue(pixel)) {
                    const queue = [{ x, y }];
                    visited.add(key);
                    let minX = x, maxX = x, minY = y, maxY = y;

                    while (queue.length > 0) {
                        const { x: cx, y: cy } = queue.shift();

                        minX = Math.min(minX, cx);
                        maxX = Math.max(maxX, cx);
                        minY = Math.min(minY, cy);
                        maxY = Math.max(maxY, cy);

                        const neighbors = [
                            { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
                            { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
                        ];

                        for (const { dx, dy } of neighbors) {
                            const nx = cx + dx;
                            const ny = cy + dy;
                            const nkey = `${nx},${ny}`;

                            if (!visited.has(nkey)) {
                                const nPixel = getPixel(nx, ny);
                                if (nPixel && isBlue(nPixel)) {
                                    visited.add(nkey);
                                    queue.push({ x: nx, y: ny });
                                }
                            }
                        }
                    }

                    const boxWidth = maxX - minX + 1;
                    const boxHeight = maxY - minY + 1;

                    if (boxWidth >= boxWidthMin && boxWidth <= boxWidthMax &&
                        boxHeight >= boxHeightMin && boxHeight <= boxHeightMax) {

                        const aspectRatio = boxWidth / boxHeight;
                        if (aspectRatio > 2.0 && aspectRatio < 3.5) { // Aspect ratio for 160x60 is 2.66
                            detectedBoxes.push({
                                x: minX + effectiveRegion.left,
                                y: minY + effectiveRegion.top,
                                width: boxWidth,
                                height: boxHeight,
                                x_relative_to_cropped: minX, // Store relative coords for sub-detection
                                y_relative_to_cropped: minY,
                            });
                        }
                    }
                }
            }
        }

        console.log(`Initial blue boxes detected (before sub-detection): ${detectedBoxes.length}`);
        console.log(`DEBUG: Raw detectedBoxes (relative to cropped region): ${JSON.stringify(detectedBoxes.map(b => ({x: b.x - effectiveRegion.left, y: b.y - effectiveRegion.top, width: b.width, height: b.height})))}`);
        console.log(`DEBUG: Effective captureRegion: ${JSON.stringify(effectiveRegion)}`);

        // Now, for each detected blue box, look for the red/orange circle and white text
        let finalBoxCounter = 1;
        for (const box of detectedBoxes) {
            if (box.width <= 0 || box.height <= 0) {
                console.warn(`Skipping blue box detection for box with invalid dimensions: ${JSON.stringify(box)}`);
                continue;
            }
            let hasRedOrangeCircle = false;
            let hasWhiteText = false;

            // --- Sub-region for red/orange circle ---
            const circleDetectRegionRelativeX = Math.floor(box.width * 0.02); // Shifted left
            const circleDetectRegionRelativeY = Math.floor(box.height * 0.05); // Slightly higher start
            const circleDetectRegionRelativeWidth = Math.floor(box.width * 0.4); // Wider
            const circleDetectRegionRelativeHeight = Math.floor(box.height * 0.9); // Taller

            const intendedCircleLeft = box.x_relative_to_cropped + circleDetectRegionRelativeX;
            const intendedCircleTop = box.y_relative_to_cropped + circleDetectRegionRelativeY;
            const intendedCircleRight = intendedCircleLeft + circleDetectRegionRelativeWidth - 1;
            const intendedCircleBottom = intendedCircleTop + circleDetectRegionRelativeHeight - 1;

            const clippedCircleLeft = Math.max(0, intendedCircleLeft);
            const clippedCircleTop = Math.max(0, intendedCircleTop);
            const clippedCircleRight = Math.min(info.width - 1, intendedCircleRight);
            const clippedCircleBottom = Math.min(info.height - 1, intendedCircleBottom);

            const circleSubRegionRelative = {
                left: clippedCircleLeft,
                top: clippedCircleTop,
                width: Math.max(1, clippedCircleRight - clippedCircleLeft + 1),
                height: Math.max(1, clippedCircleBottom - clippedCircleTop + 1)
            };

            // console.log(`DEBUG: Circle sub-region for box at x:${box.x}, y:${box.y}: ${JSON.stringify(circleSubRegionRelative)}`);

            if (circleSubRegionRelative.width > 0 && circleSubRegionRelative.height > 0) {
                const circleCroppedBuffer = await sharp(Buffer.from(base64Data, 'base64')).extract({
                    left: circleSubRegionRelative.left + effectiveRegion.left,
                    top: circleSubRegionRelative.top + effectiveRegion.top,
                    width: circleSubRegionRelative.width,
                    height: circleSubRegionRelative.height
                }).raw().toBuffer({ resolveWithObject: true });
                const { data: circleData, info: circleInfo } = circleCroppedBuffer;

                function getCirclePixel(x, y) {
                    if (x < 0 || x >= circleInfo.width || y < 0 || y >= circleInfo.height) return null;
                    const idx = (circleInfo.width * y + x) * circleInfo.channels;
                    return { r: circleData[idx], g: circleData[idx + 1], b: circleData[idx + 2], a: circleData[idx + 3] };
                }

                const circleVisited = new Set();

                for (let cy = 0; cy < circleInfo.height; cy++) {
                    for (let cx = 0; cx < circleInfo.width; cx++) {
                        const key = `${cx},${cy}`;
                        if (circleVisited.has(key)) continue;

                        const pixel = getCirclePixel(cx, cy);
                        if (pixel && isRedOrange(pixel)) {
                            const q = [{ x: cx, y: cy }];
                            circleVisited.add(key);
                            let currentBlobPixels = 0;
                            let cminX = cx, cmaxX = cx, cminY = cy, cmaxY = cy;

                            while(q.length > 0) {
                                const { x: qx, y: qy } = q.shift();
                                currentBlobPixels++;
                                cminX = Math.min(cminX, qx);
                                cmaxX = Math.max(cmaxX, qx);
                                cminY = Math.min(cminY, qy);
                                cmaxY = Math.max(cmaxY, qy);

                                const c_neighbors = [
                                    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
                                    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
                                ];
                                for (const { dx, dy } of c_neighbors) {
                                    const nqx = qx + dx;
                                    const nqy = qy + dy;
                                    const nkey = `${nqx},${nqy}`;
                                    if (!circleVisited.has(nkey) && nqx >= 0 && nqx < circleInfo.width && nqy >= 0 && nqy < circleInfo.height) {
                                        const nPixel = getCirclePixel(nqx, nqy);
                                        if (nPixel && isRedOrange(nPixel)) {
                                            circleVisited.add(nkey);
                                            q.push({ x: nqx, y: nqy });
                                        }
                                    }
                                }
                            }

                            const circleWidth = cmaxX - cminX + 1;
                            const circleHeight = cmaxY - cminY + 1;
                            const circleAspectRatio = circleWidth / circleHeight;

                            console.log(`DEBUG: Red/Orange Circle detected - currentBlobPixels: ${currentBlobPixels}, circleWidth: ${circleWidth}, circleHeight: ${circleHeight}, circleAspectRatio: ${circleAspectRatio.toFixed(2)}`);

                            if (currentBlobPixels > 20 && currentBlobPixels < 1000 && circleAspectRatio > 0.5 && circleAspectRatio < 1.5) {
                                hasRedOrangeCircle = true;
                                break;
                            }
                        }
                    }
                    if (hasRedOrangeCircle) break;
                }
            }

            // --- Sub-region for white text ---
            const textDetectRegionRelativeX = Math.floor(box.width * 0.45);
            const textDetectRegionRelativeY = Math.floor(box.height * 0.2);
            const textDetectRegionRelativeWidth = Math.floor(box.width * 0.5);
            const textDetectRegionRelativeHeight = Math.floor(box.height * 0.6);

            const intendedTextLeft = box.x_relative_to_cropped + textDetectRegionRelativeX;
            const intendedTextTop = box.y_relative_to_cropped + textDetectRegionRelativeY;
            const intendedTextRight = intendedTextLeft + textDetectRegionRelativeWidth - 1;
            const intendedTextBottom = intendedTextTop + textDetectRegionRelativeHeight - 1;

            const clippedTextLeft = Math.max(0, intendedTextLeft);
            const clippedTextTop = Math.max(0, intendedTextTop);
            const clippedTextRight = Math.min(info.width - 1, intendedTextRight);
            const clippedTextBottom = Math.min(info.height - 1, intendedTextBottom);

            const textSubRegionRelative = {
                left: clippedTextLeft,
                top: clippedTextTop,
                width: Math.max(1, clippedTextRight - clippedTextLeft + 1),
                height: Math.max(1, clippedTextBottom - clippedTextTop + 1)
            };

            if (textSubRegionRelative.width > 0 && textSubRegionRelative.height > 0) {
                const textCroppedBuffer = await sharp(Buffer.from(base64Data, 'base64')).extract({
                    left: textSubRegionRelative.left + effectiveRegion.left,
                    top: textSubRegionRelative.top + effectiveRegion.top,
                    width: textSubRegionRelative.width,
                    height: textSubRegionRelative.height
                }).raw().toBuffer({ resolveWithObject: true });
                const { data: textData, info: textInfo } = textCroppedBuffer;

                function getTextPixel(x, y) {
                    if (x < 0 || x >= textInfo.width || y < 0 || y >= textInfo.height) return null;
                    const idx = (textInfo.width * y + x) * textInfo.channels;
                    return { r: textData[idx], g: textData[idx + 1], b: textData[idx + 2], a: textData[idx + 3] };
                }

                let whitePixelCount = 0;
                let totalPixelsInTextRegion = textInfo.width * textInfo.height;

                for (let ty = 0; ty < textInfo.height; ty++) {
                    for (let tx = 0; tx < textInfo.width; tx++) {
                        const pixel = getTextPixel(tx, ty);
                        // Make white detection more lenient
                        if (pixel && pixel.r > 200 && pixel.g > 200 && pixel.b > 200) {
                            whitePixelCount++;
                        }
                    }
                }

                const whitePixelDensity = whitePixelCount / totalPixelsInTextRegion;
                console.log(`DEBUG: White text detection for box at x:${box.x}, y:${box.y} - whitePixelCount: ${whitePixelCount}, totalPixelsInTextRegion: ${totalPixelsInTextRegion}, whitePixelDensity: ${whitePixelDensity.toFixed(2)}`);
                if (whitePixelDensity > 0.05) { // Lowered threshold for white text presence
                    hasWhiteText = true;
                }
            }

            // Now re-evaluate hasRedText using the new helper function
            const textDetectRegionRelativeForRed = {
                left: Math.floor(box.width * 0.45),
                top: Math.floor(box.height * 0.2),
                width: Math.floor(box.width * 0.5),
                height: Math.floor(box.height * 0.6)
            };
            const hasRedTextResult = await hasRedTextInRegion(box, textDetectRegionRelativeForRed, base64Data, effectiveRegion, info);

            // Default state if initial blue check passes, but we need to refine this later
            let boxState = null; 

            // Calculate average color for the box
            let averageColor = { r: 0, g: 0, b: 0 };
            let totalPixels = 0;
            let greenPixelCount = 0; // New: Count green pixels
            for (let py = box.y_relative_to_cropped; py < box.y_relative_to_cropped + box.height; py++) {
                for (let px = box.x_relative_to_cropped; px < box.x_relative_to_cropped + box.width; px++) {
                    const pixel = getPixel(px, py);
                    if (pixel) {
                        totalPixels++;
                        averageColor.r += pixel.r;
                        averageColor.g += pixel.g;
                        averageColor.b += pixel.b;
                        if (isGreen(pixel)) { // Check for green pixels
                            greenPixelCount++;
                        }
                    }
                }
            }
            averageColor.r /= (totalPixels || 1);
            averageColor.g /= (totalPixels || 1);
            averageColor.b /= (totalPixels || 1);

            const greenPixelDensity = (totalPixels > 0) ? (greenPixelCount / totalPixels) : 0; // New: Calculate green pixel density
            console.log(`DEBUG: Box at x:${box.x}, y:${box.y} - Green Pixel Density: ${greenPixelDensity.toFixed(2)}`);

            // Determine box state more directly after sub-detections
            if (greenPixelDensity > greenPixelThreshold) {
                boxState = 'green_excluded'; // Exclude if too much green
                console.log(`DEBUG: Identified box at x:${box.x}, y:${box.y} as GREEN_EXCLUDED (density: ${greenPixelDensity.toFixed(2)}).`);
            } else if (isGrey(averageColor)) {
                console.log(`DEBUG: Box at x:${box.x}, y:${box.y} is generally Grey. Avg RGB: (${averageColor.r.toFixed(0)}, ${averageColor.g.toFixed(0)}, ${averageColor.b.toFixed(0)}). hasRedText: ${hasRedTextResult}, hasWhiteText: ${hasWhiteText}.`);
                if (!hasRedTextResult && hasWhiteText) {
                    boxState = 'grey_max';
                    console.log(`DEBUG: Identified box at x:${box.x}, y:${box.y} as GREY MAX (no red, has white).`);
                } else if (hasRedTextResult && hasWhiteText) {
                    boxState = 'grey_build'; // Grey with red text
                    console.log(`DEBUG: Identified box at x:${box.x}, y:${box.y} as GREY BUILD (has red, has white).`);
                } else {
                    boxState = 'other_grey'; // Grey without specific text patterns
                    console.log(`DEBUG: Identified box at x:${box.x}, y:${box.y} as OTHER GREY (no specific text).`);
                }
            } else if (hasRedOrangeCircle && hasWhiteText) { // Blue build box criteria
                console.log(`DEBUG: Blue build box check - hasRedOrangeCircle: ${hasRedOrangeCircle}, hasWhiteText: ${hasWhiteText}.`);
                // Additional check for blue dominance in the main body if it's not grey
                let bluePixelCountInBody = 0;
                let totalPixelsInBody = 0;
                const mainBodyDetectRegionRelativeX = Math.floor(box.width * 0.1);
                const mainBodyDetectRegionRelativeY = Math.floor(box.height * 0.1);
                const mainBodyDetectRegionRelativeWidth = Math.floor(box.width * 0.8);
                const mainBodyDetectRegionRelativeHeight = Math.floor(box.height * 0.8);

                const intendedMainBodyLeft = box.x_relative_to_cropped + mainBodyDetectRegionRelativeX;
                const intendedMainBodyTop = box.y_relative_to_cropped + mainBodyDetectRegionRelativeY;
                const intendedMainBodyRight = intendedMainBodyLeft + mainBodyDetectRegionRelativeWidth - 1;
                const intendedMainBodyBottom = intendedMainBodyTop + mainBodyDetectRegionRelativeHeight - 1;

                const clippedMainBodyLeft = Math.max(0, intendedMainBodyLeft);
                const clippedMainBodyTop = Math.max(0, intendedMainBodyTop);
                const clippedMainBodyRight = Math.min(info.width - 1, intendedMainBodyRight);
                const clippedMainBodyBottom = Math.min(info.height - 1, intendedMainBodyBottom);

                const mainBodySubRegionRelative = {
                    left: clippedMainBodyLeft,
                    top: clippedMainBodyTop,
                    width: Math.max(1, clippedMainBodyRight - clippedMainBodyLeft + 1),
                    height: Math.max(1, clippedMainBodyBottom - clippedMainBodyTop + 1)
                };

                if (mainBodySubRegionRelative.width > 0 && mainBodySubRegionRelative.height > 0) {
                    for (let py = mainBodySubRegionRelative.top; py < mainBodySubRegionRelative.top + mainBodySubRegionRelative.height; py++) {
                        for (let px = mainBodySubRegionRelative.left; px < mainBodySubRegionRelative.left + mainBodySubRegionRelative.width; px++) {
                            const pixel = getPixel(px, py);
                            if (pixel) {
                                totalPixelsInBody++;
                                if (isBlue(pixel)) {
                                    bluePixelCountInBody++;
                                }
                            }
                        }
                    }
                    const blueDensity = (totalPixelsInBody > 0) ? (bluePixelCountInBody / totalPixelsInBody) : 0;
                    console.log(`DEBUG: Main body blue density check - bluePixelCountInBody: ${bluePixelCountInBody}, totalPixelsInBody: ${totalPixelsInBody}, blueDensity: ${blueDensity.toFixed(2)}`);
                    if (blueDensity > 0.3) { // If predominantly blue
                        boxState = 'blue_build';
                        console.log(`DEBUG: Identified box at x:${box.x}, y:${box.y} as BLUE BUILD (blue density: ${blueDensity.toFixed(2)}).`);
                    } else {
                        boxState = 'other_non_blue'; // Not grey, not blue build
                        console.log(`DEBUG: Identified box at x:${box.x}, y:${box.y} as OTHER NON-BLUE (blue density: ${blueDensity.toFixed(2)}).`);
                    }
                }
            } else { // Neither grey nor blue build criteria met
                boxState = 'unknown';
                console.log(`DEBUG: Identified box at x:${box.x}, y:${box.y} as UNKNOWN state.`);
            }

            // Only push detections that are explicitly blue_build or grey_max
            // Removed filtering, now push all boxes that meet basic criteria with their state
            const finalBoxImage = sharp(Buffer.from(base64Data, 'base64'));
            const finalBoxImageMetadata = await finalBoxImage.metadata();

            // Permanent exclusion for X:154, Y:906 (the research button)
            const exclusionCoords = { x: 154, y: 906 };
            const exclusionTolerance = 10; // Pixels
            if (Math.abs(box.x - exclusionCoords.x) <= exclusionTolerance &&
                Math.abs(box.y - exclusionCoords.y) <= exclusionTolerance) {
                console.log(`DEBUG: Excluding blue box at x:${box.x}, y:${box.y} (near ${exclusionCoords.x}, ${exclusionCoords.y}) due to permanent exclusion.`);
                continue; // Skip this box
            }

            if (box.width <= 0 || box.height <= 0 ||
                box.x < 0 || box.y < 0 ||
                box.x + box.width > finalBoxImageMetadata.width ||
                box.y + box.height > finalBoxImageMetadata.height) {
                console.error(`Skipping final blue box extraction for box #${finalBoxCounter}: invalid dimensions or out of bounds.`, { box, finalBoxImageMetadata });
                finalBoxCounter++;
                continue;
            }

            const croppedBoxImage = await finalBoxImage.extract({
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height
            }).png().toBuffer();

            detections.push({
                id: finalBoxCounter,
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                image: `data:image/png;base64,${croppedBoxImage.toString('base64')}`,
                hasRedOrangeCircle: hasRedOrangeCircle,
                hasWhiteText: hasWhiteText,
                state: boxState, // Add the state of the box
            });
            finalBoxCounter++;
        }

        // New filtering logic: if a 'blue_build' box is found, suppress all 'unknown' boxes
        const hasBlueBuildBox = detections.some(box => box.state === 'blue_build');
        if (hasBlueBuildBox) {
            console.log('DEBUG: A \'blue_build\' box was detected. Filtering out all \'unknown\' and \'green_excluded\' boxes.');
            return detections.filter(box => box.state !== 'unknown' && box.state !== 'green_excluded');
        }

        // Also filter out green_excluded boxes if no blue_build box is present
        return detections.filter(box => box.state !== 'green_excluded');

    } catch (error) {
        console.error('Error in blue box detection with Sharp:', error);
    }

    return detections;
}

module.exports = { detect };
