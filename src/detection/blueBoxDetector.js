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
            
            const isHueBlue = (hsv.h >= 180 && hsv.h <= 260); // Broader blue hue range
            const isBlueSufficientlySaturated = hsv.s > 20; // Lower saturation threshold
            const isBlueSufficientlyBright = hsv.v > 20; // Lower brightness threshold
            const isClearlyBlue = b > r + 10 && b > g + 10; // Slightly more lenient

            return isHueBlue && isBlueSufficientlySaturated && isBlueSufficientlyBright && isClearlyBlue;
        }

        function isRedOrange(pixel) {
            const { r, g, b } = pixel;
            const hsv = rgbToHsv(r, g, b);

            const isHueRedOrange = (hsv.h >= 5 && hsv.h <= 55); // Wider red-orange hue range
            const isRedOrangeSufficientlySaturated = hsv.s > 60; // Restore original saturation
            const isRedOrangeSufficientlyBright = hsv.v > 60; // Restore original brightness

            return isHueRedOrange && isRedOrangeSufficientlySaturated && isRedOrangeSufficientlyBright;
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

        const filteredBlueBoxes = [];
        const exclusionTolerance = 5; // Pixels

        for (let i = 0; i < detectedBoxes.length; i++) {
            const box = detectedBoxes[i];
            const originalBoxId = i + 1; // Corresponds to the ID from previous logs

            let shouldExclude = false;

            // Exclude box #2 (X:154, Y:906)
            if (Math.abs(box.x - 154) <= exclusionTolerance && Math.abs(box.y - 906) <= exclusionTolerance) {
                shouldExclude = true;
            }

            if (shouldExclude) {
                console.log(`Excluding blue box (original ID: ${originalBoxId}) at x:${box.x}, y:${box.y} as per instructions.`);
                continue; // Skip this box
            }

            filteredBlueBoxes.push({ ...box, id: originalBoxId }); // Add original ID for clarity
        }

        console.log(`Filtered blue boxes for sub-detection: ${JSON.stringify(filteredBlueBoxes)}`);

        // Now, for each detected blue box, look for the red/orange circle and white text
        let finalBoxCounter = 1;
        for (const box of filteredBlueBoxes) {
            if (box.width <= 0 || box.height <= 0) {
                console.warn(`Skipping blue box detection for box with invalid dimensions: ${JSON.stringify(box)}`);
                continue;
            }
            let hasRedOrangeCircle = false;
            let hasWhiteText = false;

            // --- Sub-region for red/orange circle ---
            const circleDetectRegionRelativeX = Math.floor(box.width * 0.05);
            const circleDetectRegionRelativeY = Math.floor(box.height * 0.1);
            const circleDetectRegionRelativeWidth = Math.floor(box.width * 0.35);
            const circleDetectRegionRelativeHeight = Math.floor(box.height * 0.8);

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

                            if (currentBlobPixels > 100 && currentBlobPixels < 1000 && circleAspectRatio > 0.8 && circleAspectRatio < 1.2) {
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
                        if (pixel && pixel.r > 230 && pixel.g > 230 && pixel.b > 230) {
                            whitePixelCount++;
                        }
                    }
                }

                const whitePixelDensity = whitePixelCount / totalPixelsInTextRegion;
                if (whitePixelDensity > 0.10) {
                    hasWhiteText = true;
                }
            }

            // if (hasRedOrangeCircle && hasWhiteText) { // Temporarily disable this condition
                // Create a fresh sharp instance for the final cropped box image to avoid any state issues
                const finalBoxImage = sharp(Buffer.from(base64Data, 'base64'));
                const finalBoxImageMetadata = await finalBoxImage.metadata();

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
                    image: `data:image/png;base64,${croppedBoxImage.toString('base64')}`
                });
                finalBoxCounter++;
            // }
        }

    } catch (error) {
        console.error('Error in blue box detection with Sharp:', error);
    }

    return detections;
}

module.exports = { detect };
