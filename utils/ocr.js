const { createWorker } = require('tesseract.js');
const sharp = require('sharp');

let worker = null;

// Initialize OCR worker
async function initializeOCR() {
    if (worker) return worker;
    
    console.log('DEBUG: Initializing OCR worker...');
    worker = await createWorker('eng');
    console.log('DEBUG: OCR worker initialized successfully');
    return worker;
}

// Cleanup OCR worker
async function terminateOCR() {
    if (worker) {
        console.log('DEBUG: Terminating OCR worker...');
        await worker.terminate();
        worker = null;
        console.log('DEBUG: OCR worker terminated');
    }
}

// Capture screen region and perform OCR
async function captureAndOCR(region, captureScreenRegion) {
    try {
        console.log(`DEBUG: Starting OCR capture for region: ${JSON.stringify(region)}`);
        
        // Ensure OCR worker is initialized
        const ocrWorker = await initializeOCR();
        if (!ocrWorker) {
            throw new Error('Failed to initialize OCR worker');
        }
        
        // Capture the full screen
        const fullScreenDataUrl = await captureScreenRegion();
        if (!fullScreenDataUrl) {
            throw new Error('Failed to capture screen');
        }
        
        // Extract base64 data
        const base64Data = fullScreenDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Crop to the specified region using Sharp
        const { x, y, width, height } = region;
        const croppedImageBuffer = await sharp(imageBuffer)
            .extract({ left: x, top: y, width: width, height: height })
            .png()
            .toBuffer();
        
        console.log(`DEBUG: Cropped region ${width}x${height} at (${x}, ${y})`);
        
        // Perform OCR on the cropped image
        console.log('DEBUG: Performing OCR recognition...');
        const { data: { text } } = await ocrWorker.recognize(croppedImageBuffer);
        
        // Clean up the text (remove extra whitespace, newlines)
        const cleanedText = text.trim().replace(/\s+/g, ' ');
        
        console.log(`DEBUG: OCR result: "${cleanedText}"`);
        return cleanedText;
        
    } catch (error) {
        console.error('ERROR: OCR capture failed:', error.message);
        console.error('ERROR: OCR stack trace:', error.stack);
        return null;
    }
}

// Capture level name from the specific coordinates
async function captureLevelName(captureScreenRegion) {
    const levelNameRegion = {
        x: 110,
        y: 429,
        width: 345 - 110, // 235px width
        height: 477 - 429  // 48px height
    };
    
    console.log('DEBUG: Capturing level name from screen...');
    const levelName = await captureAndOCR(levelNameRegion, captureScreenRegion);
    
    if (levelName && levelName.length > 0) {
        console.log(`DEBUG: Level name captured: "${levelName}"`);
        return levelName;
    } else {
        console.log('DEBUG: No level name detected or OCR failed');
        return 'Unknown Level';
    }
}

module.exports = {
    initializeOCR,
    terminateOCR,
    captureAndOCR,
    captureLevelName
};
