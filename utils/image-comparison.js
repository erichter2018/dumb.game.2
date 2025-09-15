const sharp = require('sharp');

/**
 * Compare the top portion of two images to detect if we've reached the top of scrollable content
 * @param {string} imageDataUrl1 - First image as data URL
 * @param {string} imageDataUrl2 - Second image as data URL  
 * @param {Object} region - The capture region {x, y, width, height}
 * @param {number} topPercentage - Percentage of image height to compare (default 50%)
 * @param {number} threshold - Maximum difference threshold (default 0.25 = 25%)
 * @returns {Object} - {isAtTop: boolean, difference: number, message: string}
 */
async function compareTopRegions(imageDataUrl1, imageDataUrl2, region, topPercentage = 50, threshold = 0.25) {
    try {
        console.log(`DEBUG: Comparing top ${topPercentage}% of images to detect scroll position`);
        
        // Extract base64 data from both images
        const base64Data1 = imageDataUrl1.replace(/^data:image\/[a-z]+;base64,/, '');
        const base64Data2 = imageDataUrl2.replace(/^data:image\/[a-z]+;base64,/, '');
        
        const imageBuffer1 = Buffer.from(base64Data1, 'base64');
        const imageBuffer2 = Buffer.from(base64Data2, 'base64');
        
        // Get image dimensions first to validate region bounds
        const metadata1 = await sharp(imageBuffer1).metadata();
        const metadata2 = await sharp(imageBuffer2).metadata();
        
        console.log(`DEBUG: Image dimensions - Image1: ${metadata1.width}x${metadata1.height}, Image2: ${metadata2.width}x${metadata2.height}`);
        
        // Calculate the top region dimensions
        const topHeight = Math.floor(region.height * (topPercentage / 100));
        const topRegion = {
            left: Math.max(0, region.x),
            top: Math.max(0, region.y),
            width: Math.min(region.width, metadata1.width - Math.max(0, region.x)),
            height: Math.min(topHeight, metadata1.height - Math.max(0, region.y))
        };
        
        // Validate that the region is valid
        if (topRegion.width <= 0 || topRegion.height <= 0) {
            throw new Error(`Invalid extract region: ${JSON.stringify(topRegion)}`);
        }
        
        console.log(`DEBUG: Extracting top region: ${JSON.stringify(topRegion)}`);
        
        // Extract the top portion of both images and convert to raw format for comparison
        const topImage1RawBuffer = await sharp(imageBuffer1)
            .extract(topRegion)
            .raw()
            .toBuffer();
            
        const topImage2RawBuffer = await sharp(imageBuffer2)
            .extract(topRegion)
            .raw()
            .toBuffer();
        
        // Get image metadata from the original extracted regions (before raw conversion)
        const topImage1PngBuffer = await sharp(imageBuffer1)
            .extract(topRegion)
            .png()
            .toBuffer();
            
        const topImage2PngBuffer = await sharp(imageBuffer2)
            .extract(topRegion)
            .png()
            .toBuffer();
            
        const topMetadata1 = await sharp(topImage1PngBuffer).metadata();
        const topMetadata2 = await sharp(topImage2PngBuffer).metadata();
        
        const width = topMetadata1.width;
        const height = topMetadata1.height;
        const channels = topMetadata1.channels || 3; // RGB
        
        console.log(`DEBUG: Comparing images: ${width}x${height}, ${channels} channels`);
        
        // Calculate pixel-by-pixel difference
        let totalDifference = 0;
        let totalPixels = 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * width + x) * channels;
                
                // Get RGB values for both images
                const r1 = topImage1RawBuffer[pixelIndex];
                const g1 = topImage1RawBuffer[pixelIndex + 1];
                const b1 = topImage1RawBuffer[pixelIndex + 2];
                
                const r2 = topImage2RawBuffer[pixelIndex];
                const g2 = topImage2RawBuffer[pixelIndex + 1];
                const b2 = topImage2RawBuffer[pixelIndex + 2];
                
                // Calculate color difference (0-1 scale)
                const rDiff = Math.abs(r1 - r2) / 255;
                const gDiff = Math.abs(g1 - g2) / 255;
                const bDiff = Math.abs(b1 - b2) / 255;
                
                const pixelDifference = (rDiff + gDiff + bDiff) / 3;
                totalDifference += pixelDifference;
                totalPixels++;
            }
        }
        
        // Calculate average difference
        const averageDifference = totalPixels > 0 ? totalDifference / totalPixels : 0;
        
        const isAtTop = averageDifference <= threshold;
        
        console.log(`DEBUG: Image comparison result - Difference: ${(averageDifference * 100).toFixed(2)}%, Threshold: ${(threshold * 100)}%, AtTop: ${isAtTop}`);
        
        return {
            isAtTop,
            difference: averageDifference,
            message: `Top ${topPercentage}% difference: ${(averageDifference * 100).toFixed(2)}% (threshold: ${(threshold * 100)}%)`
        };
        
    } catch (error) {
        console.error('ERROR: Image comparison failed:', error.message);
        return {
            isAtTop: false,
            difference: 1.0,
            message: `Comparison failed: ${error.message}`
        };
    }
}

/**
 * Capture the top portion of the current screen for scroll comparison
 * @param {Function} captureScreenRegion - Function to capture full screen
 * @param {Object} region - The capture region {x, y, width, height}
 * @param {number} topPercentage - Percentage of image height to capture (default 50%)
 * @returns {string|null} - Data URL of the top region, or null if failed
 */
async function captureTopRegion(captureScreenRegion, region, topPercentage = 50) {
    try {
        console.log(`DEBUG: Capturing top ${topPercentage}% of region for scroll comparison`);
        
        // Capture full screen
        const fullScreenDataUrl = await captureScreenRegion();
        if (!fullScreenDataUrl) {
            throw new Error('Failed to capture screen');
        }
        
        // Extract base64 data
        const base64Data = fullScreenDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Get image dimensions first to validate region bounds
        const metadata = await sharp(imageBuffer).metadata();
        console.log(`DEBUG: Full screen dimensions: ${metadata.width}x${metadata.height}`);
        
        // Calculate the top region dimensions
        const topHeight = Math.floor(region.height * (topPercentage / 100));
        const topRegion = {
            left: Math.max(0, region.x),
            top: Math.max(0, region.y),
            width: Math.min(region.width, metadata.width - Math.max(0, region.x)),
            height: Math.min(topHeight, metadata.height - Math.max(0, region.y))
        };
        
        // Validate that the region is valid
        if (topRegion.width <= 0 || topRegion.height <= 0) {
            throw new Error(`Invalid extract region: ${JSON.stringify(topRegion)}`);
        }
        
        console.log(`DEBUG: Extracting top region: ${JSON.stringify(topRegion)}`);
        
        // Extract and convert back to data URL
        const topImageBuffer = await sharp(imageBuffer)
            .extract(topRegion)
            .png()
            .toBuffer();
            
        // Convert back to data URL
        const topImageBase64 = topImageBuffer.toString('base64');
        const topImageDataUrl = `data:image/png;base64,${topImageBase64}`;
        
        console.log(`DEBUG: Successfully captured top region: ${topRegion.width}x${topRegion.height}`);
        
        return topImageDataUrl;
        
    } catch (error) {
        console.error('ERROR: Failed to capture top region:', error.message);
        return null;
    }
}

/**
 * Compare the bottom portion of two images to detect if we've reached the bottom of scrollable content
 * @param {string} imageDataUrl1 - First image as data URL
 * @param {string} imageDataUrl2 - Second image as data URL  
 * @param {Object} region - The capture region {x, y, width, height}
 * @param {number} bottomPercentage - Percentage of image height to compare (default 50%)
 * @param {number} threshold - Maximum difference threshold (default 0.05 = 5%)
 * @returns {Object} - {isAtBottom: boolean, difference: number, message: string}
 */
async function compareBottomRegions(imageDataUrl1, imageDataUrl2, region, bottomPercentage = 50, threshold = 0.05) {
    try {
        console.log(`DEBUG: Comparing bottom ${bottomPercentage}% of images to detect scroll position`);
        
        // Extract base64 data from both images
        const base64Data1 = imageDataUrl1.replace(/^data:image\/[a-z]+;base64,/, '');
        const base64Data2 = imageDataUrl2.replace(/^data:image\/[a-z]+;base64,/, '');
        
        const imageBuffer1 = Buffer.from(base64Data1, 'base64');
        const imageBuffer2 = Buffer.from(base64Data2, 'base64');
        
        // Get image dimensions first to validate region bounds
        const metadata1 = await sharp(imageBuffer1).metadata();
        const metadata2 = await sharp(imageBuffer2).metadata();
        
        console.log(`DEBUG: Image dimensions - Image1: ${metadata1.width}x${metadata1.height}, Image2: ${metadata2.width}x${metadata2.height}`);
        
        // Calculate the bottom region dimensions
        const bottomHeight = Math.floor(region.height * (bottomPercentage / 100));
        const bottomRegion = {
            left: Math.max(0, region.x),
            top: Math.max(0, region.y + region.height - bottomHeight),
            width: Math.min(region.width, metadata1.width - Math.max(0, region.x)),
            height: Math.min(bottomHeight, metadata1.height - Math.max(0, region.y + region.height - bottomHeight))
        };
        
        // Validate that the region is valid
        if (bottomRegion.width <= 0 || bottomRegion.height <= 0) {
            throw new Error(`Invalid extract region: ${JSON.stringify(bottomRegion)}`);
        }
        
        console.log(`DEBUG: Extracting bottom region: ${JSON.stringify(bottomRegion)}`);
        
        // Extract the bottom portion of both images and convert to raw format for comparison
        const bottomImage1RawBuffer = await sharp(imageBuffer1)
            .extract(bottomRegion)
            .raw()
            .toBuffer();
            
        const bottomImage2RawBuffer = await sharp(imageBuffer2)
            .extract(bottomRegion)
            .raw()
            .toBuffer();
        
        // Get image metadata from the original extracted regions (before raw conversion)
        const bottomImage1PngBuffer = await sharp(imageBuffer1)
            .extract(bottomRegion)
            .png()
            .toBuffer();
            
        const bottomImage2PngBuffer = await sharp(imageBuffer2)
            .extract(bottomRegion)
            .png()
            .toBuffer();
            
        const bottomMetadata1 = await sharp(bottomImage1PngBuffer).metadata();
        const bottomMetadata2 = await sharp(bottomImage2PngBuffer).metadata();
        
        const width = bottomMetadata1.width;
        const height = bottomMetadata1.height;
        const channels = bottomMetadata1.channels || 3; // RGB
        
        console.log(`DEBUG: Comparing bottom images: ${width}x${height}, ${channels} channels`);
        
        // Calculate pixel-by-pixel difference
        let totalDifference = 0;
        let totalPixels = 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * width + x) * channels;
                
                // Get RGB values for both images
                const r1 = bottomImage1RawBuffer[pixelIndex];
                const g1 = bottomImage1RawBuffer[pixelIndex + 1];
                const b1 = bottomImage1RawBuffer[pixelIndex + 2];
                
                const r2 = bottomImage2RawBuffer[pixelIndex];
                const g2 = bottomImage2RawBuffer[pixelIndex + 1];
                const b2 = bottomImage2RawBuffer[pixelIndex + 2];
                
                // Calculate color difference (0-1 scale)
                const rDiff = Math.abs(r1 - r2) / 255;
                const gDiff = Math.abs(g1 - g2) / 255;
                const bDiff = Math.abs(b1 - b2) / 255;
                
                const pixelDifference = (rDiff + gDiff + bDiff) / 3;
                totalDifference += pixelDifference;
                totalPixels++;
            }
        }
        
        // Calculate average difference
        const averageDifference = totalPixels > 0 ? totalDifference / totalPixels : 0;
        
        const isAtBottom = averageDifference <= threshold;
        
        console.log(`DEBUG: Bottom image comparison result - Difference: ${(averageDifference * 100).toFixed(2)}%, Threshold: ${(threshold * 100)}%, AtBottom: ${isAtBottom}`);
        
        return {
            isAtBottom,
            difference: averageDifference,
            message: `Bottom ${bottomPercentage}% difference: ${(averageDifference * 100).toFixed(2)}% (threshold: ${(threshold * 100)}%)`
        };
        
    } catch (error) {
        console.error('ERROR: Bottom image comparison failed:', error.message);
        return {
            isAtBottom: false,
            difference: 1.0,
            message: `Comparison failed: ${error.message}`
        };
    }
}

/**
 * Capture the bottom portion of the current screen for scroll comparison
 * @param {Function} captureScreenRegion - Function to capture full screen
 * @param {Object} region - The capture region {x, y, width, height}
 * @param {number} bottomPercentage - Percentage of image height to capture (default 50%)
 * @returns {string|null} - Data URL of the bottom region, or null if failed
 */
async function captureBottomRegion(captureScreenRegion, region, bottomPercentage = 50) {
    try {
        console.log(`DEBUG: Capturing bottom ${bottomPercentage}% of region for scroll comparison`);
        
        // Capture full screen
        const fullScreenDataUrl = await captureScreenRegion();
        if (!fullScreenDataUrl) {
            throw new Error('Failed to capture screen');
        }
        
        // Extract base64 data
        const base64Data = fullScreenDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Get image dimensions first to validate region bounds
        const metadata = await sharp(imageBuffer).metadata();
        console.log(`DEBUG: Full screen dimensions: ${metadata.width}x${metadata.height}`);
        
        // Calculate the bottom region dimensions
        const bottomHeight = Math.floor(region.height * (bottomPercentage / 100));
        const bottomRegion = {
            left: Math.max(0, region.x),
            top: Math.max(0, region.y + region.height - bottomHeight),
            width: Math.min(region.width, metadata.width - Math.max(0, region.x)),
            height: Math.min(bottomHeight, metadata.height - Math.max(0, region.y + region.height - bottomHeight))
        };
        
        // Validate that the region is valid
        if (bottomRegion.width <= 0 || bottomRegion.height <= 0) {
            throw new Error(`Invalid extract region: ${JSON.stringify(bottomRegion)}`);
        }
        
        console.log(`DEBUG: Extracting bottom region: ${JSON.stringify(bottomRegion)}`);
        
        // Extract and convert back to data URL
        const bottomImageBuffer = await sharp(imageBuffer)
            .extract(bottomRegion)
            .png()
            .toBuffer();
            
        // Convert back to data URL
        const bottomImageBase64 = bottomImageBuffer.toString('base64');
        const bottomImageDataUrl = `data:image/png;base64,${bottomImageBase64}`;
        
        console.log(`DEBUG: Successfully captured bottom region: ${bottomRegion.width}x${bottomRegion.height}`);
        
        return bottomImageDataUrl;
        
    } catch (error) {
        console.error('ERROR: Failed to capture bottom region:', error.message);
        return null;
    }
}

module.exports = {
    compareTopRegions,
    captureTopRegion,
    compareBottomRegions,
    captureBottomRegion
};
