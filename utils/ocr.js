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
        
        // Simple crop without preprocessing (preprocessing will be done per-use-case)
        const croppedImageBuffer = await sharp(imageBuffer)
            .extract({ left: x, top: y, width: width, height: height })
            .png()
            .toBuffer();
        
        console.log(`DEBUG: Cropped region ${width}x${height} at (${x}, ${y})`);
        
        // Save debug images - keep last 5, deleting oldest
        const fs = require('fs');
        const path = require('path');
        const debugDir = path.join(__dirname, '..');
        
        // Shift existing images: 4->5, 3->4, 2->3, 1->2
        for (let i = 4; i >= 1; i--) {
            const oldPath = path.join(debugDir, `debug_ocr_${i}.png`);
            const newPath = path.join(debugDir, `debug_ocr_${i + 1}.png`);
            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
            }
        }
        
        // Delete the oldest (6th) if it exists
        const oldestPath = path.join(debugDir, 'debug_ocr_6.png');
        if (fs.existsSync(oldestPath)) {
            fs.unlinkSync(oldestPath);
        }
        
        // Save new image as #1
        const debugPath = path.join(debugDir, 'debug_ocr_1.png');
        await sharp(croppedImageBuffer).toFile(debugPath);
        console.log(`DEBUG: Saved OCR input image to ${debugPath}`);
        
        // Perform OCR on the cropped image
        console.log('DEBUG: Performing OCR recognition...');
        const result = await ocrWorker.recognize(croppedImageBuffer);
        const text = result.data.text;
        
        // Log EVERYTHING from OCR for debugging
        console.log(`DEBUG: RAW OCR text (before any cleaning): "${text}"`);
        console.log(`DEBUG: OCR confidence: ${result.data.confidence}`);
        console.log(`DEBUG: OCR text length: ${text.length}`);
        console.log(`DEBUG: OCR text charCodes: ${[...text].map(c => c.charCodeAt(0)).join(',')}`);
        
        // Clean up the text (remove extra whitespace, newlines)
        const cleanedText = text.trim().replace(/\s+/g, ' ');
        
        console.log(`DEBUG: OCR result after cleaning: "${cleanedText}"`);
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

// Capture build name from blue box
// The build name appears in a FIXED position ABOVE the blue box, just below "Level XX"
// It's always the same distance above the blue box
async function captureBuildName(blueBox, captureScreenRegion) {
    try {
        if (!blueBox || !blueBox.x || !blueBox.y || !blueBox.width || !blueBox.height) {
            console.log('DEBUG: Invalid blue box coordinates for build name capture');
            return null;
        }
        
        // The build name is 103px above the blue button
        const buildNameRegion = {
            x: Math.round(blueBox.x + 10),
            y: Math.round(blueBox.y - 103),
            width: Math.round(blueBox.width - 20),
            height: 20
        };
        
        console.log(`DEBUG: Capturing build name from region above blue box: ${JSON.stringify(buildNameRegion)}`);
        
        // Capture and preprocess specifically for gray build name text
        const fullScreenDataUrl = await captureScreenRegion();
        if (!fullScreenDataUrl) {
            console.error('ERROR: Failed to capture screen for build name');
            return null;
        }
        
        const base64Data = fullScreenDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Apply consistent preprocessing for gray text
        const processedImageBuffer = await sharp(imageBuffer)
            .extract({ left: buildNameRegion.x, top: buildNameRegion.y, width: buildNameRegion.width, height: buildNameRegion.height })
            .resize(buildNameRegion.width * 3, buildNameRegion.height * 3, { kernel: 'cubic' })
            .greyscale()
            .linear(1.3, -30) // Consistent darkening
            .png()
            .toBuffer();
        
        // Save debug image (commented out - uncomment for troubleshooting)
        // const fs = require('fs');
        // const path = require('path');
        // const debugDir = path.join(__dirname, '..');
        // 
        // // Shift existing images: 4->5, 3->4, 2->3, 1->2
        // for (let i = 4; i >= 1; i--) {
        //     const oldPath = path.join(debugDir, `debug_ocr_${i}.png`);
        //     const newPath = path.join(debugDir, `debug_ocr_${i + 1}.png`);
        //     if (fs.existsSync(oldPath)) {
        //         fs.renameSync(oldPath, newPath);
        //     }
        // }
        // 
        // // Delete the oldest (6th) if it exists
        // const oldestPath = path.join(debugDir, 'debug_ocr_6.png');
        // if (fs.existsSync(oldestPath)) {
        //     fs.unlinkSync(oldestPath);
        // }
        // 
        // // Save new image as #1
        // const debugPath = path.join(debugDir, 'debug_ocr_1.png');
        // await sharp(processedImageBuffer).toFile(debugPath);
        // console.log(`DEBUG: Saved OCR input image to ${debugPath}`);
        
        // Perform OCR
        const ocrWorker = await initializeOCR();
        const result = await ocrWorker.recognize(processedImageBuffer);
        const ocrText = result.data.text.trim().replace(/\s+/g, ' ');
        
        if (ocrText && ocrText.length > 0) {
            console.log(`DEBUG: Raw OCR text: "${ocrText}"`);
            
            // Clean up the text - be tolerant of edge artifacts
            let cleaned = ocrText
                .replace(/\d+\.?\d*[KkMm]/g, '') // Remove numbers with K or M suffix
                .replace(/Level\s+\d+/i, '') // Remove "Level XX" if somehow captured
                .replace(/^[\d\s]+/, '') // Remove leading numbers and spaces (like "1 Soda" -> "Soda")
                .replace(/[^a-zA-Z0-9\s\-']/g, '') // Keep only letters, numbers, spaces, hyphens, apostrophes
                .trim();
            
            // If we have multiple words, try to find the valid one (in case of edge artifacts)
            if (cleaned.includes(' ')) {
                const words = cleaned.split(/\s+/);
                // Find the first word that looks like a proper build name (starts with capital, at least 3 chars)
                const validWord = words.find(w => w.length >= 3 && /^[A-Z]/.test(w));
                if (validWord) {
                    // Take all words starting from the valid one
                    const validIndex = words.indexOf(validWord);
                    cleaned = words.slice(validIndex).join(' ');
                }
            }
            
            // Validate the cleaned text
            if (cleaned.length < 3) {
                console.log(`DEBUG: Text too short (${cleaned.length} chars), likely not a build name`);
                return null;
            }
            
            // Must start with a capital letter
            if (!/^[A-Z]/.test(cleaned)) {
                console.log(`DEBUG: Text doesn't start with capital letter ("${cleaned}"), likely not a build name`);
                return null;
            }
            
            // Additional check: if the result looks like it's mostly numbers, it's probably wrong
            const numberRatio = (cleaned.match(/\d/g) || []).length / cleaned.length;
            if (numberRatio > 0.5) {
                console.log(`DEBUG: Text appears to be mostly numbers (${(numberRatio * 100).toFixed(0)}%), likely not a build name`);
                return null;
            }
            
            if (cleaned.length > 0) {
                console.log(`DEBUG: Build name extracted: "${cleaned}"`);
                return cleaned;
            }
        }
        
        console.log('DEBUG: No build name detected or OCR failed');
        return null;
        
    } catch (error) {
        console.error('ERROR: Failed to capture build name:', error.message);
        return null;
    }
}

module.exports = {
    initializeOCR,
    terminateOCR,
    captureAndOCR,
    captureLevelName,
    captureBuildName
};
