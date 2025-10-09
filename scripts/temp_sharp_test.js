const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function runSharpTest() {
    console.log("Starting Sharp extraction test...");

    // Create a dummy 100x100 blue PNG image as base64 for testing
    // This is a minimal valid PNG for a 1x1 blue pixel. We will scale it up conceptually for the test.
    // In a real scenario, this would come from desktopCapturer.
    const dummyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApuvngAAAAABJRU5ErkJggg=='; 
    const imageDataUrl = `data:image/png;base64,${dummyPngBase64}`;

    try {
        const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '');
        const fullScreenImage = sharp(Buffer.from(base64Data, 'base64'));
        const fullScreenMetadata = await fullScreenImage.metadata();
        console.log('Full Screen Image Metadata (after decoding PNG):', fullScreenMetadata);

        // For this test, let's assume the dummy image is effectively 450x900
        // and we want to extract a small region from it.
        const testWidth = 450;
        const testHeight = 900;

        // Ensure the effective region is within the bounds of the "conceptual" fullScreenImage
        const effectiveRegion = {
            left: 0,
            top: 100,
            width: 50,
            height: 50,
        };

        if (effectiveRegion.left < 0 || effectiveRegion.top < 0 ||
            effectiveRegion.left + effectiveRegion.width > testWidth ||
            effectiveRegion.top + effectiveRegion.height > testHeight) {
            console.error('Test Error: Effective region is out of bounds for the conceptual test image.');
            return;
        }

        console.log('Effective Region for Cropping (absolute coordinates):', effectiveRegion);

        // Extract the effective region and get its raw pixel data
        const croppedImageBuffer = await fullScreenImage.extract(effectiveRegion).raw().toBuffer({ resolveWithObject: true });
        const { data: croppedData, info: croppedInfo } = croppedImageBuffer;

        console.log('Cropped Image Info (after extraction to raw pixels):', croppedInfo);
        if (croppedInfo.width === 0 || croppedInfo.height === 0) {
            console.error('Error: Cropped image has zero width or height after extraction.', croppedInfo);
            return;
        }

        // --- getPixel and HSV conversion (simplified for test) ---
        function getPixel(x, y) {
            if (x < 0 || x >= croppedInfo.width || y < 0 || y >= croppedInfo.height) return null;
            const idx = (croppedInfo.width * y + x) * croppedInfo.channels;
            return { r: croppedData[idx], g: croppedData[idx + 1], b: croppedData[idx + 2], a: croppedData[idx + 3] };
        }

        function rgbToHsv(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            let max = Math.max(r, g, b);
            let min = Math.min(r, g, b);
            let h, s, v = max;
            let d = max - min;
            s = max === 0 ? 0 : d / max;
            if (max === min) { h = 0; } else {
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { h: h * 360, s: s * 100, v: v * 100 };
        }
        // --- End getPixel and HSV conversion ---

        // Log first few pixels of cropped image data
        for (let i = 0; i < Math.min(20, croppedData.length / croppedInfo.channels); i++) {
            const x = i % croppedInfo.width;
            const y = Math.floor(i / croppedInfo.width);
            const pixel = getPixel(x, y);
            if (pixel) {
                const hsv = rgbToHsv(pixel.r, pixel.g, pixel.b);
                console.log(`Cropped pixel (${x}, ${y}): RGB(${pixel.r},${pixel.g},${pixel.b}), HSV(${hsv.h},${hsv.s},${hsv.v})`);
            }
        }

        console.log("Sharp extraction test completed successfully.");

    } catch (error) {
        console.error('Error during Sharp test:', error);
    }
}

runSharpTest();
