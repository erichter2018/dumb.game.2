const sharp = require('sharp');

async function detect(imageDataUrl, captureRegion) {
    console.log('Detecting red blobs with Sharp...', { captureRegion });
    const detections = [];

    try {
        const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '');
        const fullScreenImage = sharp(Buffer.from(base64Data, 'base64'));

        const metadata = await fullScreenImage.metadata();

        const effectiveRegion = {
            left: captureRegion.x,
            top: captureRegion.y,
            width: captureRegion.width,
            height: captureRegion.height,
        };

        // Extract the effective region once and work with this smaller image
        const croppedEffectiveImageBuffer = await fullScreenImage.extract(effectiveRegion).raw().toBuffer({ resolveWithObject: true });
        const { data, info } = croppedEffectiveImageBuffer;
        const croppedEffectiveImage = sharp(data, { raw: info }); // Create a new sharp instance from the cropped buffer

        const blobSizeMin = 24; // Relaxed from 25
        const blobSizeMax = 34; // Relaxed from 30
        const detectedBlobs = [];

        const visited = new Set();

        function getPixel(x, y) {
            if (x < 0 || x >= info.width || y < 0 || y >= info.height) return null;
            const idx = (info.width * y + x) * info.channels;
            return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
        }

        function rgbToHsv(r, g, b) {
            r /= 255, g /= 255, b /= 255;

            let max = Math.max(r, g, b);
            let min = Math.min(r, g, b);
            let h, s, v = max;

            let d = max - min;
            s = max === 0 ? 0 : d / max;

            if (max === min) {
                h = 0; // achromatic
            } else {
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { h: h * 360, s: s * 100, v: v * 100 };
        }

        function isRed(pixel) {
            const { r, g, b } = pixel;
            const hsv = rgbToHsv(r, g, b);

            // Restored red hue range and saturation/value for more lenient detection
            const isHueRed = (hsv.h >= 0 && hsv.h <= 15) || (hsv.h >= 345 && hsv.h <= 360); // Broader hue range
            const isSaturatedAndBright = hsv.s > 70 && hsv.v > 60; 

            return isHueRed && isSaturatedAndBright;
        }

        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const key = `${x},${y}`;
                if (visited.has(key)) continue;

                const pixel = getPixel(x, y);
                if (pixel && isRed(pixel)) {
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
                                if (nPixel && isRed(nPixel)) {
                                    visited.add(nkey);
                                    queue.push({ x: nx, y: ny });
                                }
                            }
                        }
                    }

                    const blobWidth = maxX - minX + 1;
                    const blobHeight = maxY - minY + 1;
                    const area = blobWidth * blobHeight;

                    // Filter by size (24x24 to 34x34 pixels) and a more precise round shape check
                    const expectedMinArea = blobSizeMin * blobSizeMin; 
                    const expectedMaxArea = blobSizeMax * blobSizeMax; 

                    if (area >= expectedMinArea * 0.5 && area <= expectedMaxArea * 1.5 && 
                        blobWidth >= blobSizeMin * 0.5 && blobWidth <= blobSizeMax * 1.5 && 
                        blobHeight >= blobSizeMin * 0.5 && blobHeight <= blobSizeMax * 1.5) {

                        const aspectRatio = blobWidth / blobHeight;
                        if (aspectRatio > 0.7 && aspectRatio < 1.3) { 

                            // For arrow detection, refine the white pixel check in the upper middle
                            let hasWhiteArrow = false;
                            // Adjust arrow detection region based on expected blob size
                            const arrowRegionRelativeX = Math.floor(blobWidth * 0.25);
                            const arrowRegionRelativeY = Math.floor(blobHeight * 0.2);
                            const arrowRegionWidth = Math.floor(blobWidth * 0.5);
                            const arrowRegionHeight = Math.floor(blobHeight * 0.4);

                            for (let ay = minY + arrowRegionRelativeY; ay < minY + arrowRegionRelativeY + arrowRegionHeight; ay++) {
                                for (let ax = minX + arrowRegionRelativeX; ax < minX + arrowRegionRelativeX + arrowRegionWidth; ax++) {
                                    const arrowPixel = getPixel(ax, ay);
                                    // Check for very bright white (r,g,b > 240) to ensure it's a distinct arrow
                                    if (arrowPixel && arrowPixel.r > 240 && arrowPixel.g > 240 && arrowPixel.b > 240) {
                                        hasWhiteArrow = true;
                                        break;
                                    }
                                }
                                if (hasWhiteArrow) break;
                            }

                            if (hasWhiteArrow) {
                                detectedBlobs.push({
                                    x: minX + effectiveRegion.left, // Convert to absolute screen coordinate
                                    y: minY + effectiveRegion.top,   // Convert to absolute screen coordinate
                                    width: blobWidth,
                                    height: blobHeight,
                                });
                            }
                        }
                    }
                }
            }
        }

        console.log(`Detected blobs before exclusion: ${JSON.stringify(detectedBlobs)}`);

        const filteredAndNamedBlobs = [];
        const exclusionTolerance = 5; // Pixels

        for (let i = 0; i < detectedBlobs.length; i++) {
            const blob = detectedBlobs[i];
            const originalBlobId = i + 1; // Corresponds to the ID from previous logs
            const newBlob = { ...blob }; // Initialize newBlob here

            // Check for exclusion (blobs 1, 2, 6 from previous logs)
            let shouldExclude = false;

            // Blob 1 (e.g., x:48, y:206)
            if (Math.abs(blob.x - 48) <= exclusionTolerance && Math.abs(blob.y - 206) <= exclusionTolerance) {
                shouldExclude = true;
            }
            // Blob at X:386, Y:207 (new exclusion)
            if (Math.abs(blob.x - 386) <= exclusionTolerance && Math.abs(blob.y - 207) <= exclusionTolerance) {
                shouldExclude = true;
            }
            // Blob 2 (e.g., x:48, y:280)
            if (Math.abs(blob.x - 48) <= exclusionTolerance && Math.abs(blob.y - 280) <= exclusionTolerance) {
                shouldExclude = true;
            }
            // Blob 6 (e.g., x:300, y:894)
            if (Math.abs(blob.x - 300) <= exclusionTolerance && Math.abs(blob.y - 894) <= exclusionTolerance) {
                shouldExclude = true;
            }
            // New exclusion for 'exit level' blob (x:51, y:890)
            if (Math.abs(blob.x - 51) <= exclusionTolerance && Math.abs(blob.y - 890) <= exclusionTolerance) {
                shouldExclude = true;
            }

            // Check for naming (blob 5 from previous logs - e.g., x:368, y:893)
            if (Math.abs(blob.x - 368) <= exclusionTolerance && Math.abs(blob.y - 893) <= exclusionTolerance) {
                newBlob.name = "research blob";
                console.log(`Naming blob (original ID: ${originalBlobId}) at x:${blob.x}, y:${blob.y} as "research blob".`);
            }

            if (shouldExclude) {
                console.log(`Excluding blob (original ID: ${originalBlobId}) at x:${blob.x}, y:${blob.y} as per instructions.`);
                continue; // Skip this blob
            }

            filteredAndNamedBlobs.push(newBlob);
        }

        console.log(`Filtered and named blobs for extraction: ${JSON.stringify(filteredAndNamedBlobs)}`);

        // Now, extract images for the detected blobs from the original full screen image
        let blobCounter = 1;
        for (const blob of filteredAndNamedBlobs) {
            // These coordinates are already absolute, directly from detectedBlobs
            const extractLeftAbsolute = blob.x;
            const extractTopAbsolute = blob.y;
            const extractWidth = blob.width;
            const extractHeight = blob.height;

            // Create a fresh sharp instance for each extraction to avoid internal state issues
            const freshFullScreenImage = sharp(Buffer.from(base64Data, 'base64'));

            // Validate against the full screen image dimensions (metadata of the fresh instance)
            const freshMetadata = await freshFullScreenImage.metadata();
            if (extractWidth <= 0 || extractHeight <= 0 ||
                extractLeftAbsolute < 0 || extractTopAbsolute < 0 ||
                extractLeftAbsolute + extractWidth > freshMetadata.width ||
                extractTopAbsolute + extractHeight > freshMetadata.height) {
                console.error(`Skipping invalid blob extraction (final validation) for blob #${blobCounter}: x=${extractLeftAbsolute}, y=${extractTopAbsolute}, width=${extractWidth}, height=${extractHeight} (Image dimensions: ${freshMetadata.width}x${freshMetadata.height})`);
                blobCounter++; // Increment even if skipped
                continue; 
            }

            console.log(`Extracting blob #${blobCounter} (named: ${blob.name || 'none'}) at x:${extractLeftAbsolute}, y:${extractTopAbsolute}, width:${extractWidth}, height:${extractHeight}.`);

            const croppedBlobBuffer = await freshFullScreenImage.extract({
                left: extractLeftAbsolute,
                top: extractTopAbsolute,
                width: extractWidth,
                height: extractHeight
            }).png().toBuffer();

            detections.push({
                id: blobCounter,
                x: blob.x,
                y: blob.y,
                width: blob.width,
                height: blob.height,
                name: blob.name || undefined,
                image: `data:image/png;base64,${croppedBlobBuffer.toString('base64')}`
            });
            blobCounter++;
        }

    } catch (error) {
        console.error('Error in red blob detection with Sharp:', error);
    }

    return detections;
}

module.exports = { detect };
