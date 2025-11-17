// Ads Automation
// Functionality for triggering and cancelling ads to increase income modifier

/**
 * Capture and send screenshot to modal for debugging
 * Uses the same method as the upper window screenshot (node-screenshots directly)
 * @param {number} x - X coordinate (center)
 * @param {number} y - Y coordinate (center)
 * @param {number} size - Size of region to capture (square)
 * @param {string} label - Label for the screenshot
 * @param {Function} updateStatus - Status update function
 * @param {boolean} showModal - Whether to show modal
 */
async function captureAndSendScreenshot(x, y, size, label, updateStatus, showModal) {
    if (!showModal || !updateStatus) return;
    
    try {
        const { Monitor } = require('node-screenshots');
        const monitors = Monitor.all();
        const primaryMonitor = monitors.find(m => m.isPrimary);
        
        if (!primaryMonitor) {
            console.log(`DEBUG: No primary monitor found for ${label} screenshot`);
            return;
        }
        
        // Calculate crop region (centered on x, y)
        const screenshotX = Math.max(0, Math.floor(x - size / 2));
        const screenshotY = Math.max(0, Math.floor(y - size / 2));
        
        // Use the same method as the upper window screenshot
        const screenshotImage = primaryMonitor.captureImageSync();
        const screenshotCrop = screenshotImage.cropSync(
            screenshotX,
            screenshotY,
            size,
            size
        );
        const screenshotBuffer = screenshotCrop.toPngSync();
        const base64String = screenshotBuffer.toString('base64');
        const imageDataUrl = `data:image/png;base64,${base64String}`;
        
        console.log(`DEBUG: Sending X button screenshot to modal, size: ${base64String.length} chars`);
        // Use a separator that won't appear in data URLs: |||
        updateStatus(`screenshot|||${label}|||${imageDataUrl}`, 'info');
        console.log(`DEBUG: Captured screenshot for ${label} at (${x}, ${y})`);
    } catch (e) {
        console.error(`ERROR: Failed to capture screenshot for ${label}:`, e);
    }
}

/**
 * Detect if the "Boost x12 +40 min" box is present
 * If this box is absent, we're probably in an ad
 * If it reappears, we're out of the ad successfully
 * 
 * @param {Object} dependencies - Dependencies object
 * @returns {Promise<boolean>} True if boost box is present (not in ad), false if absent (in ad)
 */
async function detectBoostBox(dependencies) {
    const { captureScreenRegion } = dependencies;
    
    try {
        // The boost box is around the ad start click location
        // We'll check a region around x230, y950 for the text "Boost" or "+40 min"
        const boostBoxRegion = {
            x: 180,  // Left edge of boost box area
            y: 920,  // Top edge of boost box area
            width: 150,  // Width to cover boost box
            height: 50   // Height to cover boost box
        };
        
        // Use direct OCR with preprocessing (similar to countdown reading) for better accuracy
        const sharp = require('sharp');
        const { initializeOCR } = require('../../utils/ocr');
        const fs = require('fs');
        const path = require('path');
        const debugDir = path.join(__dirname, '..', '..');
        
        // Capture the full screen
        const fullScreenDataUrl = await captureScreenRegion();
        if (!fullScreenDataUrl) {
            console.log('DEBUG: Failed to capture screen for boost box detection');
            return false;
        }
        
        const base64Data = fullScreenDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Extract the boost box region
        const rawCroppedBuffer = await sharp(imageBuffer)
            .extract({ 
                left: boostBoxRegion.x, 
                top: boostBoxRegion.y, 
                width: boostBoxRegion.width, 
                height: boostBoxRegion.height 
            })
            .png()
            .toBuffer();
        
        // Save raw cropped region for debugging
        const debugPath = path.join(debugDir, 'debug_boost_region.png');
        await sharp(rawCroppedBuffer).toFile(debugPath);
        console.log(`DEBUG: Saved boost box region screenshot to ${debugPath}`);
        
        // Apply preprocessing for better OCR (resize, greyscale, contrast)
        // Boost box text is white on blue, so we need to enhance contrast
        // Try multiple preprocessing approaches and use the best result
        
        // Helper function to check if OCR text matches boost pattern
        function matchesBoostPattern(text) {
            if (!text) return false;
            const hasBoost = /boost/i.test(text);
            const hasPlus40Min = /\+40\s*min/i.test(text) || /\+40min/i.test(text) || /iomin/i.test(text); // Handle OCR error "iomin" for "+40min"
            const hasX12 = /x12/i.test(text) || /\bx\s*12\b/i.test(text) || /xI2/i.test(text) || /xl2/i.test(text); // Handle OCR errors "xI2", "xl2" for "x12"
            return hasBoost && (hasPlus40Min || hasX12);
        }
        
        const ocrWorker = await initializeOCR();
        let bestResult = null;
        let bestConfidence = 0;
        let bestText = '';
        let bestProcessedBuffer = null;
        let bestMatchesPattern = false;
        
        // Approach 1: Try raw image first (no preprocessing) - sometimes works better
        try {
            const result0 = await ocrWorker.recognize(rawCroppedBuffer);
            const text0 = result0.data.text.trim();
            const matches0 = matchesBoostPattern(text0);
            // Prioritize results that match the pattern, even with lower confidence
            if ((matches0 && !bestMatchesPattern) || 
                (matches0 && bestMatchesPattern && result0.data.confidence > bestConfidence) ||
                (!bestMatchesPattern && result0.data.confidence > bestConfidence && text0.length > 0)) {
                bestConfidence = result0.data.confidence;
                bestText = text0;
                bestResult = result0;
                bestProcessedBuffer = rawCroppedBuffer;
                bestMatchesPattern = matches0;
            }
            console.log(`DEBUG: Boost box OCR (raw) - text: "${text0}", confidence: ${result0.data.confidence}, matches: ${matches0}`);
        } catch (e) {
            console.error('ERROR: OCR raw failed:', e);
        }
        
        // Approach 2: Moderate preprocessing - resize and contrast
        try {
            const processedImageBuffer1 = await sharp(rawCroppedBuffer)
                .resize(boostBoxRegion.width * 2, boostBoxRegion.height * 2, { kernel: 'cubic' })
                .greyscale()
                .linear(1.5, -20) // Moderate contrast
                .png()
                .toBuffer();
            
            const result1 = await ocrWorker.recognize(processedImageBuffer1);
            const text1 = result1.data.text.trim();
            const matches1 = matchesBoostPattern(text1);
            // Prioritize results that match the pattern
            if ((matches1 && !bestMatchesPattern) || 
                (matches1 && bestMatchesPattern && result1.data.confidence > bestConfidence) ||
                (!bestMatchesPattern && result1.data.confidence > bestConfidence && text1.length > 0)) {
                bestConfidence = result1.data.confidence;
                bestText = text1;
                bestResult = result1;
                bestProcessedBuffer = processedImageBuffer1;
                bestMatchesPattern = matches1;
            }
            console.log(`DEBUG: Boost box OCR (approach 1 - moderate) - text: "${text1}", confidence: ${result1.data.confidence}, matches: ${matches1}`);
        } catch (e) {
            console.error('ERROR: OCR approach 1 failed:', e);
        }
        
        // Approach 3: Invert colors (makes white text black on light background)
        try {
            const processedImageBuffer2 = await sharp(rawCroppedBuffer)
                .resize(boostBoxRegion.width * 2, boostBoxRegion.height * 2, { kernel: 'cubic' })
                .greyscale()
                .negate() // Invert: white text becomes black
                .normalize()
                .linear(1.2, 0) // Slight contrast boost
                .png()
                .toBuffer();
            
            const result2 = await ocrWorker.recognize(processedImageBuffer2);
            const text2 = result2.data.text.trim();
            const matches2 = matchesBoostPattern(text2);
            // Prioritize results that match the pattern
            if ((matches2 && !bestMatchesPattern) || 
                (matches2 && bestMatchesPattern && result2.data.confidence > bestConfidence) ||
                (!bestMatchesPattern && result2.data.confidence > bestConfidence && text2.length > 0)) {
                bestConfidence = result2.data.confidence;
                bestText = text2;
                bestResult = result2;
                bestProcessedBuffer = processedImageBuffer2;
                bestMatchesPattern = matches2;
            }
            console.log(`DEBUG: Boost box OCR (approach 2 - inverted) - text: "${text2}", confidence: ${result2.data.confidence}, matches: ${matches2}`);
        } catch (e) {
            console.error('ERROR: OCR approach 2 failed:', e);
        }
        
        // Approach 4: High contrast for white text on blue
        try {
            const processedImageBuffer3 = await sharp(rawCroppedBuffer)
                .resize(boostBoxRegion.width * 2, boostBoxRegion.height * 2, { kernel: 'cubic' })
                .greyscale()
                .normalize()
                .linear(2.0, -40) // High contrast, darken background
                .png()
                .toBuffer();
            
            const result3 = await ocrWorker.recognize(processedImageBuffer3);
            const text3 = result3.data.text.trim();
            const matches3 = matchesBoostPattern(text3);
            // Prioritize results that match the pattern
            if ((matches3 && !bestMatchesPattern) || 
                (matches3 && bestMatchesPattern && result3.data.confidence > bestConfidence) ||
                (!bestMatchesPattern && result3.data.confidence > bestConfidence && text3.length > 0)) {
                bestConfidence = result3.data.confidence;
                bestText = text3;
                bestResult = result3;
                bestProcessedBuffer = processedImageBuffer3;
                bestMatchesPattern = matches3;
            }
            console.log(`DEBUG: Boost box OCR (approach 3 - high contrast) - text: "${text3}", confidence: ${result3.data.confidence}, matches: ${matches3}`);
        } catch (e) {
            console.error('ERROR: OCR approach 3 failed:', e);
        }
        
        // Save the best preprocessed version
        const debugProcessedPath = path.join(debugDir, 'debug_boost_processed.png');
        if (bestProcessedBuffer) {
            await sharp(bestProcessedBuffer).toFile(debugProcessedPath);
            console.log(`DEBUG: Saved best preprocessed boost box image to ${debugProcessedPath}`);
        }
        
        const rawText = bestText || '';
        
        console.log(`DEBUG: Boost box OCR - Best result text: "${rawText}"`);
        console.log(`DEBUG: Boost box OCR - Best confidence: ${bestConfidence}`);
        
        const ocrText = rawText ? rawText.trim() : '';
        const hasOcrText = ocrText.length > 0;
        
        // Check if the best result matches the boost pattern (using the helper function)
        const boostBoxPresent = bestMatchesPattern;
        
        if (boostBoxPresent) {
            console.log(`DEBUG: Boost box detected via OCR - text: "${ocrText}", confidence: ${bestConfidence}`);
            return true; // OCR found it, we're good
        }
        
        // OCR didn't match boost pattern - check countdown timer as fallback
        // If countdown timer is detected, we're definitely on game screen (not in ad)
        // So assume boost box is present even if we can't detect it
        console.log(`DEBUG: OCR text "${ocrText}" didn't match boost pattern - checking countdown timer as fallback indicator...`);
        try {
            const countdownText = await readAdCountdown({ captureScreenRegion });
            if (countdownText && countdownText.trim().length > 0) {
                console.log(`DEBUG: Countdown timer detected: "${countdownText}" - assuming boost box is present (on game screen)`);
                return true; // Countdown present = we're on game screen = boost box is there
            } else {
                console.log('DEBUG: No countdown timer detected either - likely in an ad');
            }
        } catch (e) {
            console.error('ERROR: Failed to check countdown timer:', e);
        }
        
        // OCR found text but didn't match, and countdown not detected
        // Try color detection only if OCR found SOME text (suggests we're on game screen)
        if (hasOcrText) {
            console.log('DEBUG: OCR found text but didn\'t match boost pattern, and countdown not detected - trying color-based detection as fallback...');
        } else {
            // OCR completely failed (no text at all) - likely in an ad, don't use color detection
            console.log('DEBUG: OCR and countdown both failed - assuming in ad, NOT using color detection');
            return false;
        }
        
        // Only use color-based detection if OCR found SOME text (even if it didn't match)
        // This ensures we're on the game screen, not in an ad
        try {
            const sharp = require('sharp');
            const { Monitor } = require('node-screenshots');
            const monitors = Monitor.all();
            const primaryMonitor = monitors.find(m => m.isPrimary);
            
            if (!primaryMonitor) {
                console.log('DEBUG: No primary monitor found for color detection - assuming in ad');
                return false;
            }
            
            // Capture the boost box region
            const image = primaryMonitor.captureImageSync();
            const croppedImage = image.cropSync(boostBoxRegion.x, boostBoxRegion.y, boostBoxRegion.width, boostBoxRegion.height);
            const imageBuffer = croppedImage.toPngSync();
            
            // Get raw RGB pixel data
            const rawBuffer = await sharp(imageBuffer)
                .raw()
                .toBuffer();
            
            const metadata = await sharp(imageBuffer).metadata();
            const pixelCount = metadata.width * metadata.height;
            
            // Count blue pixels with STRICTER criteria
            // Boost box has specific blue colors - need to match more precisely
            let bluePixelCount = 0;
            let darkBluePixelCount = 0; // Dark blue (filled portion) - typically RGB ~(30,60,120)
            let lightBluePixelCount = 0; // Light blue (unfilled) - typically RGB ~(100,150,220)
            let veryBluePixelCount = 0; // Very blue pixels (strong blue dominance)
            
            for (let i = 0; i < rawBuffer.length; i += 3) {
                const r = rawBuffer[i];
                const g = rawBuffer[i + 1];
                const b = rawBuffer[i + 2];
                
                // Stricter blue detection: blue must be significantly dominant
                // Boost box blue: blue channel is much higher than red/green
                // Dark blue: b ~50-120, r ~20-50, g ~40-80
                // Light blue: b ~150-220, r ~80-120, g ~120-180
                const blueDominance = b - Math.max(r, g);
                const isBlue = blueDominance > 30 && b > 50 && b < 250; // Blue is strongly dominant
                
                if (isBlue) {
                    bluePixelCount++;
                    
                    // Very blue pixels (strong blue dominance > 50)
                    if (blueDominance > 50) {
                        veryBluePixelCount++;
                    }
                    
                    // Classify as dark or light blue
                    if (b < 120) {
                        darkBluePixelCount++; // Dark blue (filled portion)
                    } else {
                        lightBluePixelCount++; // Light blue (unfilled or partially filled)
                    }
                }
            }
            
            const bluePercentage = (bluePixelCount / pixelCount) * 100;
            const veryBluePercentage = (veryBluePixelCount / pixelCount) * 100;
            console.log(`DEBUG: Boost box detection (color) - blue pixels: ${bluePixelCount}/${pixelCount} (${bluePercentage.toFixed(1)}%), very blue: ${veryBluePixelCount} (${veryBluePercentage.toFixed(1)}%), dark: ${darkBluePixelCount}, light: ${lightBluePixelCount}`);
            
            // MUCH STRICTER criteria to avoid false positives from ads:
            // 1. Need at least 30% blue pixels (was 20%)
            // 2. OR at least 15% very blue pixels (strong blue dominance)
            // 3. Must have BOTH dark and light blue pixels (boost box has both filled and unfilled areas)
            const hasEnoughBlue = bluePercentage >= 30 || veryBluePercentage >= 15;
            const hasBothDarkAndLight = darkBluePixelCount > 0 && lightBluePixelCount > 0;
            
            if (hasEnoughBlue && hasBothDarkAndLight) {
                console.log(`DEBUG: Boost box detected via color - blue: ${bluePercentage.toFixed(1)}%, very blue: ${veryBluePercentage.toFixed(1)}%, has both dark/light: ${hasBothDarkAndLight}`);
                return true;
            } else {
                console.log(`DEBUG: Boost box NOT detected via color - blue: ${bluePercentage.toFixed(1)}%, very blue: ${veryBluePercentage.toFixed(1)}%, has both dark/light: ${hasBothDarkAndLight}`);
                return false;
            }
        } catch (colorError) {
            console.error('ERROR: Color-based boost box detection failed:', colorError);
            // Fall through to return false
        }
        
        // Both OCR and color detection failed
        console.log('DEBUG: Both OCR and color detection failed for boost box - assuming in ad');
        return false;
    } catch (error) {
        console.error('ERROR: Boost box detection failed:', error);
        return false; // Assume in ad on error
    }
}

/**
 * Read the countdown timer from the ad bonus box
 * Location: x195, y983 to x272, y1002
 * Contains numbers and 'h', 'm', 's' (e.g., "40m", "1h 20m", "30s")
 * 
 * @param {Object} dependencies - Dependencies object
 * @returns {Promise<string|null>} Countdown text (e.g., "40m", "1h 20m") or null if not found
 */
async function readAdCountdown(dependencies) {
    const { captureScreenRegion, captureAndOCR, updateStatus, showModal } = dependencies;
    
    try {
        const countdownRegion = {
            x: 195,
            y: 979,  // Moved up by 4 pixels (was 983)
            width: 272 - 195,  // 77px width
            height: 1002 - 983  // 19px height
        };
        
        console.log('DEBUG: Reading ad countdown from region:', countdownRegion);
        
        // Use direct OCR with preprocessing (similar to build name capture)
        const sharp = require('sharp');
        const { initializeOCR } = require('../../utils/ocr');
        
        // Capture the full screen
        const fullScreenDataUrl = await captureScreenRegion();
        if (!fullScreenDataUrl) {
            console.log('DEBUG: Failed to capture screen for countdown');
            return null;
        }
        
        const base64Data = fullScreenDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Extract the region first (before preprocessing) for debug screenshot
        const fs = require('fs');
        const path = require('path');
        const debugDir = path.join(__dirname, '..', '..');
        
        // Save raw cropped region for debugging
        const rawCroppedBuffer = await sharp(imageBuffer)
            .extract({ 
                left: countdownRegion.x, 
                top: countdownRegion.y, 
                width: countdownRegion.width, 
                height: countdownRegion.height 
            })
            .png()
            .toBuffer();
        
        const debugPath = path.join(debugDir, 'debug_countdown_region.png');
        await sharp(rawCroppedBuffer).toFile(debugPath);
        console.log(`DEBUG: Saved countdown region screenshot to ${debugPath}`);
        
        // Apply preprocessing for small text (resize, greyscale, contrast)
        const processedImageBuffer = await sharp(rawCroppedBuffer)
            .resize(countdownRegion.width * 4, countdownRegion.height * 4, { kernel: 'cubic' }) // 4x resize for better OCR
            .greyscale()
            .linear(1.5, -40) // Increase contrast and darken
            .png()
            .toBuffer();
        
        // Also save the preprocessed version
        const debugProcessedPath = path.join(debugDir, 'debug_countdown_processed.png');
        await sharp(processedImageBuffer).toFile(debugProcessedPath);
        console.log(`DEBUG: Saved preprocessed countdown image to ${debugProcessedPath}`);
        
        // Perform OCR on preprocessed image
        const ocrWorker = await initializeOCR();
        const result = await ocrWorker.recognize(processedImageBuffer);
        const rawText = result.data.text;
        
        console.log(`DEBUG: RAW OCR text for countdown: "${rawText}"`);
        console.log(`DEBUG: OCR confidence: ${result.data.confidence}`);
        
        if (!rawText || rawText.trim().length === 0) {
            console.log('DEBUG: OCR returned empty text for countdown');
            return null;
        }
        
        // Clean up OCR text - keep only numbers, h, m, s, and spaces
        const cleanedText = rawText.replace(/[^0-9hms\s]/gi, '').trim();
        
        if (cleanedText.length > 0) {
            console.log(`DEBUG: Ad countdown read: "${cleanedText}"`);
            
            // Send screenshot of countdown region to modal (for debugging)
            // Only send if showModal is true (to avoid clutter when called internally)
            if (updateStatus && showModal) {
                try {
                    const countdownBase64 = rawCroppedBuffer.toString('base64');
                    const countdownDataUrl = `data:image/png;base64,${countdownBase64}`;
                    // Use a separator that won't appear in data URLs: |||
                    updateStatus(`screenshot|||Countdown: "${cleanedText}"|||${countdownDataUrl}`, 'info');
                    console.log(`DEBUG: Sent countdown screenshot to modal`);
                } catch (e) {
                    console.error('ERROR: Failed to send countdown screenshot:', e);
                }
            }
            
            return cleanedText;
        }
        
        console.log(`DEBUG: No countdown text detected after cleaning. Raw was: "${rawText}"`);
        return null;
    } catch (error) {
        console.error('ERROR: Failed to read ad countdown:', error);
        return null;
    }
}

/**
 * Template matching using normalized cross-correlation (manual implementation)
 * More reliable than OpenCV.js which has API issues in Node.js
 */
async function templateMatch(imageBuffer, templateBuffer, threshold = 0.4) {
    const sharp = require('sharp');
    
    try {
        // Get image dimensions
        const imageMeta = await sharp(imageBuffer).metadata();
        const templateMeta = await sharp(templateBuffer).metadata();
        
        const imgWidth = imageMeta.width;
        const imgHeight = imageMeta.height;
        const tmplWidth = templateMeta.width;
        const tmplHeight = templateMeta.height;
        
        // Convert to greyscale and get raw pixel data
        const imgRaw = await sharp(imageBuffer).greyscale().raw().toBuffer();
        const tmplRaw = await sharp(templateBuffer).greyscale().raw().toBuffer();
        
        // Calculate template mean and std dev
        let tmplSum = 0;
        for (let i = 0; i < tmplRaw.length; i++) {
            tmplSum += tmplRaw[i];
        }
        const tmplMean = tmplSum / tmplRaw.length;
        
        let tmplVarSum = 0;
        for (let i = 0; i < tmplRaw.length; i++) {
            const diff = tmplRaw[i] - tmplMean;
            tmplVarSum += diff * diff;
        }
        const tmplStdDev = Math.sqrt(tmplVarSum / tmplRaw.length);
        
        let bestMatch = { x: 0, y: 0, score: 0 };
        
        // Slide template over image with step size for performance
        const stepSize = 1; // Check every pixel
        for (let y = 0; y <= imgHeight - tmplHeight; y += stepSize) {
            for (let x = 0; x <= imgWidth - tmplWidth; x += stepSize) {
                // Calculate correlation for this position
                let sum = 0;
                let imgSum = 0;
                let imgSumSq = 0;
                
                for (let ty = 0; ty < tmplHeight; ty++) {
                    for (let tx = 0; tx < tmplWidth; tx++) {
                        const imgIdx = ((y + ty) * imgWidth + (x + tx));
                        const tmplIdx = (ty * tmplWidth + tx);
                        
                        if (imgIdx >= imgRaw.length) continue;
                        
                        const imgVal = imgRaw[imgIdx];
                        const tmplVal = tmplRaw[tmplIdx];
                        
                        sum += imgVal * tmplVal;
                        imgSum += imgVal;
                        imgSumSq += imgVal * imgVal;
                    }
                }
                
                const imgMean = imgSum / tmplRaw.length;
                const imgVariance = Math.sqrt(Math.max(0, imgSumSq / tmplRaw.length - imgMean * imgMean));
                
                // Normalized cross-correlation
                const correlation = (sum / tmplRaw.length - imgMean * tmplMean) / (imgVariance * tmplStdDev + 1e-10);
                
                if (correlation > bestMatch.score) {
                    bestMatch = { 
                        x: x + Math.floor(tmplWidth / 2), 
                        y: y + Math.floor(tmplHeight / 2), 
                        score: correlation 
                    };
                }
            }
        }
        
        if (bestMatch.score >= threshold) {
            return bestMatch;
        }
        
        return null;
    } catch (error) {
        console.error('ERROR: Template matching failed:', error);
        return null;
    }
}

/**
 * Detect X button using OpenCV template matching
 * Uses OpenCV's matchTemplate for reliable template matching
 * 
 * @param {Object} dependencies - Dependencies object
 * @param {string} baselineImageDataUrl - Baseline image (not used, but kept for compatibility)
 * @returns {Promise<Object|null>} Button coordinates {x, y, type: 'x'|'fastforward'} or null
 */
async function detectAdCloseButton(dependencies, baselineImageDataUrl) {
    const { captureScreenRegion, iphoneMirroringRegion, getIsAutomationPaused, waitIfPaused, updateStatus, showModal = true } = dependencies;
    
    try {
        // Check for pause/interrupt
        if (getIsAutomationPaused && getIsAutomationPaused()) {
            if (waitIfPaused) await waitIfPaused();
        }
        
        // Extract top portion of screen where X buttons appear in ads
        // X buttons are typically at the very top of the screen (above iPhone window)
        // Search starting 80 pixels from top, 210 pixels height across the full width of the iPhone window
        const topRightRegion = {
            x: iphoneMirroringRegion.x,  // Start from left edge of iPhone window
            y: 80,  // Start 80 pixels from absolute top of screen (moved up 10px from 90)
            width: iphoneMirroringRegion.width, // Full width of iPhone window
            height: 210  // 210 pixels height
        };
        
        const regionMsg = `Using OpenCV template matching to detect X button in top region: x=${topRightRegion.x}, y=${topRightRegion.y}, width=${topRightRegion.width}, height=${topRightRegion.height}`;
        console.log(`DEBUG: ${regionMsg}`);
        updateStatus(regionMsg, 'info');
        
        // Use node-screenshots to capture region
        const { Monitor } = require('node-screenshots');
        const monitors = Monitor.all();
        const primaryMonitor = monitors.find(m => m.isPrimary);
        
        if (!primaryMonitor) {
            console.error('ERROR: No primary monitor found');
            return null;
        }
        
        // Capture the screen region
        const image = primaryMonitor.captureImageSync();
        const croppedImage = image.cropSync(topRightRegion.x, topRightRegion.y, topRightRegion.width, topRightRegion.height);
        
        // Convert to PNG buffer for OpenCV
        const searchRegionBuffer = croppedImage.toPngSync();
        
        // Send captured image to modal for display (before OpenCV processing)
        // Only if showModal is true
        if (showModal) {
            try {
                const base64String = searchRegionBuffer.toString('base64');
                const imageDataUrl = `data:image/png;base64,${base64String}`;
                console.log(`DEBUG: Sending image update to modal, size: ${base64String.length} chars`);
                updateStatus(`image-update:${imageDataUrl}`, 'info');
            } catch (e) {
                console.error('ERROR sending image update:', e);
            }
        }
        
        // Load OpenCV.js fresh each time (as it worked before)
        const cv = require('opencv.js');
        
        if (!cv || !cv.Mat || !cv.imdecode) {
            console.error('ERROR: OpenCV.js not properly loaded');
            updateStatus('OpenCV.js not available', 'error');
            return null;
        }
        
        console.log('DEBUG: OpenCV.js loaded successfully');
        updateStatus('OpenCV.js loaded', 'info');
        
        // Read image from buffer using cv.imdecode
        // OpenCV.js imdecode expects a Uint8Array, but we need to ensure proper format
        let imgMat = null;
        try {
            const sharp = require('sharp');
            
            // Use Sharp to convert PNG buffer to raw greyscale data
            const imageMeta = await sharp(searchRegionBuffer).metadata();
            const rawBuffer = await sharp(searchRegionBuffer)
                .greyscale() // Convert to greyscale for template matching
                .raw()
                .toBuffer();
            
            console.log(`DEBUG: Image metadata - width: ${imageMeta.width}, height: ${imageMeta.height}, channels: ${imageMeta.channels}`);
            console.log(`DEBUG: Raw buffer length: ${rawBuffer.length}, expected: ${imageMeta.width * imageMeta.height}`);
            
            // Create Mat from raw buffer data
            // Mat constructor: new cv.Mat(rows, cols, type)
            imgMat = new cv.Mat(imageMeta.height, imageMeta.width, cv.CV_8UC1);
            
            // Copy raw buffer data into Mat using data property
            // OpenCV.js Mat.data is a Uint8Array - use set() to copy data directly
            if (!imgMat.data || imgMat.data.length === 0) {
                throw new Error('Mat data not available or empty');
            }
            
            console.log(`DEBUG: Mat data length: ${imgMat.data.length}, raw buffer length: ${rawBuffer.length}`);
            
            // Copy buffer data directly into Mat.data
            imgMat.data.set(rawBuffer);
            
            console.log(`DEBUG: Mat created - rows: ${imgMat.rows}, cols: ${imgMat.cols}, empty: ${imgMat.empty()}`);
            
            // Save debug image to verify Mat data
            const fs = require('fs');
            const path = require('path');
            const debugPath = path.join(__dirname, '..', '..', 'debug_opencv_mat.png');
            try {
                // Convert Mat back to image for debugging
                const debugBuffer = Buffer.from(imgMat.data);
                await sharp(debugBuffer, {
                    raw: { width: imageMeta.width, height: imageMeta.height, channels: 1 }
                }).png().toFile(debugPath);
                console.log(`DEBUG: Saved Mat debug image to ${debugPath}`);
            } catch (e) {
                console.error('ERROR saving debug image:', e);
            }
            
            if (!imgMat || imgMat.empty()) {
                console.error('ERROR: Failed to create Mat from image');
                updateStatus('Failed to create Mat', 'error');
                if (imgMat) imgMat.delete();
                return null;
            }
        } catch (error) {
            console.error('ERROR: OpenCV Mat creation failed:', error);
            console.error('ERROR stack:', error.stack);
            updateStatus('Mat creation failed', 'error');
            if (imgMat) imgMat.delete();
            return null;
        }
        
        // Try multiple template sizes and thicknesses for better detection of hidden X buttons
        const templateSizes = [12, 15, 18, 20, 22, 25, 28, 30];
        let bestMatch = null;
        let bestScore = 0;
        
        // Try different X template styles: thin, medium, thick
        const templateStyles = [
            { name: 'thin', thicknessRatio: 0.08 },   // Very thin X
            { name: 'medium', thicknessRatio: 0.12 },  // Medium thickness
            { name: 'thick', thicknessRatio: 0.15 }    // Thick X
        ];
        
        for (const templateSize of templateSizes) {
            for (const style of templateStyles) {
                let templateMat = null;
                let result = null;
                
                try {
                    // Create X template with varying thickness
                    templateMat = new cv.Mat(templateSize, templateSize, cv.CV_8UC1);
                    const thickness = Math.max(1, Math.floor(templateSize * style.thicknessRatio));
                    
                    // Draw X shape - try both diagonal lines
                    for (let y = 0; y < templateSize; y++) {
                        for (let x = 0; x < templateSize; x++) {
                            // Distance from diagonal line 1 (top-left to bottom-right)
                            const dist1 = Math.abs(x - y);
                            // Distance from diagonal line 2 (top-right to bottom-left)
                            const dist2 = Math.abs(x - (templateSize - 1 - y));
                            // Check if pixel is on either diagonal line (within thickness)
                            const value = (dist1 < thickness || dist2 < thickness) ? 255 : 0;
                            templateMat.ucharPtr(y, x)[0] = value;
                        }
                    }
                    
                    // Perform template matching
                    result = new cv.Mat();
                    cv.matchTemplate(imgMat, templateMat, result, cv.TM_CCOEFF_NORMED);
                    
                    // Find best match
                    const minMax = cv.minMaxLoc(result);
                    const maxVal = minMax.maxVal;
                    const maxLoc = minMax.maxLoc;
                    
                    const matchMsg = `OpenCV match - size ${templateSize}, style ${style.name}, score: ${maxVal.toFixed(3)}, loc: (${maxLoc.x}, ${maxLoc.y})`;
                    if (maxVal > 0.3) { // Only log promising matches
                        console.log(`DEBUG: ${matchMsg}`);
                        updateStatus(matchMsg, 'info');
                    }
                    
                    if (maxVal > bestScore) {
                        bestScore = maxVal;
                        bestMatch = {
                            x: maxLoc.x + Math.floor(templateSize / 2),
                            y: maxLoc.y + Math.floor(templateSize / 2),
                            score: maxVal,
                            size: templateSize,
                            style: style.name
                        };
                    }
                } catch (error) {
                    console.error(`ERROR: OpenCV template matching failed for size ${templateSize}, style ${style.name}:`, error);
                } finally {
                    // Clean up
                    if (templateMat) {
                        try {
                            templateMat.delete();
                        } catch (e) {
                            console.error('ERROR cleaning up templateMat:', e);
                        }
                    }
                    if (result) {
                        try {
                            result.delete();
                        } catch (e) {
                            console.error('ERROR cleaning up result:', e);
                        }
                    }
                }
            }
        }
        
        // Stricter threshold to avoid false positives (gear icons, mountain images, etc.)
        const minThreshold = 0.50; // Increased from 0.45 to further reduce false positives
        
        if (bestMatch && bestScore >= minThreshold) {
            // bestMatch.x and bestMatch.y are relative to topRightRegion
            // Add the region offset to get absolute screen coordinates
            const centerX = topRightRegion.x + bestMatch.x;
            const centerY = topRightRegion.y + bestMatch.y;
            
            console.log(`DEBUG: bestMatch relative: (${bestMatch.x}, ${bestMatch.y}), region: (${topRightRegion.x}, ${topRightRegion.y}), absolute: (${centerX}, ${centerY})`);
            
            // Validate the detected area is actually bright/white (X buttons are white)
            // Extract a small region around the detected point to check brightness
            try {
                const sharp = require('sharp');
                const { Monitor } = require('node-screenshots');
                const monitors = Monitor.all();
                const primaryMonitor = monitors.find(m => m.isPrimary);
                
                if (primaryMonitor) {
                    const validationSize = 20; // Check 20x20 area around the detected point
                    const validationX = Math.max(0, centerX - validationSize / 2);
                    const validationY = Math.max(0, centerY - validationSize / 2);
                    
                    const validationImage = primaryMonitor.captureImageSync();
                    const validationCrop = validationImage.cropSync(
                        validationX, 
                        validationY, 
                        validationSize, 
                        validationSize
                    );
                    const validationBuffer = validationCrop.toPngSync();
                    
                    // Check average brightness of the region
                    const validationMeta = await sharp(validationBuffer).metadata();
                    const validationRaw = await sharp(validationBuffer)
                        .greyscale()
                        .raw()
                        .toBuffer();
                    
                    // Check for bright pixels (X buttons are white, but may be partially hidden)
                    // Since X buttons are small (10-25px) on dark backgrounds, check max brightness
                    // rather than average brightness
                    let maxBrightness = 0;
                    let brightPixelCount = 0;
                    let veryBrightPixelCount = 0; // Count pixels > 220 (very bright white)
                    let mediumBrightPixelCount = 0; // Count pixels > 150 (medium bright)
                    
                    for (let i = 0; i < validationRaw.length; i++) {
                        const brightness = validationRaw[i];
                        if (brightness > maxBrightness) {
                            maxBrightness = brightness;
                        }
                        if (brightness > 220) { // Very bright pixels (likely part of visible X)
                            veryBrightPixelCount++;
                        }
                        if (brightness > 200) { // Bright pixels
                            brightPixelCount++;
                        }
                        if (brightness > 150) { // Medium bright pixels (for partially hidden X)
                            mediumBrightPixelCount++;
                        }
                    }
                    
                    console.log(`DEBUG: Validation - max: ${maxBrightness}, bright(>200): ${brightPixelCount}, veryBright(>220): ${veryBrightPixelCount}, mediumBright(>150): ${mediumBrightPixelCount}`);
                    
                    // More flexible validation for hidden X buttons:
                    // - If max brightness is high (>180), accept even with fewer bright pixels
                    // - If there are many medium-bright pixels (>150), it might be a partially hidden X
                    // - Require at least some bright pixels to avoid false positives
                    const hasHighMaxBrightness = maxBrightness > 180;
                    const hasEnoughBrightPixels = brightPixelCount >= 5 || veryBrightPixelCount >= 3;
                    const hasManyMediumBrightPixels = mediumBrightPixelCount >= 15; // Many medium-bright pixels suggest X shape
                    
                    if (!hasHighMaxBrightness && !hasEnoughBrightPixels && !hasManyMediumBrightPixels) {
                        console.log(`DEBUG: Rejected match - brightness validation failed (max: ${maxBrightness}, bright: ${brightPixelCount}, medium: ${mediumBrightPixelCount})`);
                        updateStatus(`Rejected match - brightness validation failed (max: ${maxBrightness})`, 'warn');
                        return null;
                    }
                    
                    // Validate that the detected region contains straight lines (true X buttons have straight lines)
                    // Use OpenCV to detect lines in the validation region
                    try {
                        const validationImageMat = new cv.Mat(validationSize, validationSize, cv.CV_8UC1);
                        const validationRawArray = new Uint8Array(validationRaw);
                        validationImageMat.data.set(validationRawArray);
                        
                        // Apply Canny edge detection to find edges
                        const edges = new cv.Mat();
                        cv.Canny(validationImageMat, edges, 50, 150);
                        
                        // Use HoughLinesP to detect straight line segments
                        const lines = new cv.Mat();
                        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 10, 5, 10);
                        
                        // Check if we found at least 2 lines (X has 2 diagonal lines)
                        const lineCount = lines.rows;
                        console.log(`DEBUG: Line detection found ${lineCount} line segments`);
                        
                        // Require at least 4 lines for better confidence (gear icons, UI elements might have 2-3 lines)
                        // True X buttons should have clear diagonal lines that form multiple segments
                        if (lineCount < 4) {
                            console.log(`DEBUG: Rejected match - insufficient straight lines detected (${lineCount} lines, need at least 4)`);
                            updateStatus(`Rejected match - not enough straight lines (${lineCount}, need 4+)`, 'warn');
                            edges.delete();
                            lines.delete();
                            validationImageMat.delete();
                            return null;
                        }
                        
                        // Check that lines form an X shape (two diagonal lines crossing)
                        // An X has one line from top-left to bottom-right (~45 degrees)
                        // and one line from top-right to bottom-left (~135 degrees)
                        // Count lines in each direction to ensure we have a clear X pattern
                        let forwardDiagonalCount = 0;  // 35-55 degrees (tighter range around 45)
                        let backwardDiagonalCount = 0; // 125-145 degrees (tighter range around 135)
                        
                        for (let i = 0; i < lineCount; i++) {
                            const x1 = lines.data32S[i * 4];
                            const y1 = lines.data32S[i * 4 + 1];
                            const x2 = lines.data32S[i * 4 + 2];
                            const y2 = lines.data32S[i * 4 + 3];
                            
                            const dx = x2 - x1;
                            const dy = y2 - y1;
                            // Don't use abs - we need to distinguish direction
                            // atan2 returns -180 to 180, convert to 0-360
                            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                            if (angle < 0) angle += 360;
                            
                            // Normalize to 0-180 range (since lines are bidirectional)
                            if (angle > 180) angle = 360 - angle;
                            
                            // Calculate line length for weight
                            const lineLength = Math.sqrt(dx * dx + dy * dy);
                            
                            console.log(`DEBUG: Line ${i}: (${x1},${y1}) to (${x2},${y2}), angle: ${angle.toFixed(1)} degrees, length: ${lineLength.toFixed(1)}`);
                            
                            // Use original angle before normalization to check both directions
                            const originalAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                            const normalizedAngle = originalAngle < 0 ? originalAngle + 360 : originalAngle;
                            
                            // Forward diagonal: tighter range around 45 degrees (35-55 OR 215-235)
                            if ((normalizedAngle >= 35 && normalizedAngle <= 55) || 
                                (normalizedAngle >= 215 && normalizedAngle <= 235)) {
                                forwardDiagonalCount++;
                                console.log(`DEBUG: Found forward diagonal line at angle ${normalizedAngle.toFixed(1)} degrees`);
                            }
                            
                            // Backward diagonal: tighter range around 135 degrees (125-145 OR 305-325)
                            if ((normalizedAngle >= 125 && normalizedAngle <= 145) || 
                                (normalizedAngle >= 305 && normalizedAngle <= 325)) {
                                backwardDiagonalCount++;
                                console.log(`DEBUG: Found backward diagonal line at angle ${normalizedAngle.toFixed(1)} degrees`);
                            }
                        }
                        
                        // Require at least 2 lines in EACH diagonal direction for a true X button
                        // This ensures we have a clear X pattern, not just random lines or gear icons
                        if (forwardDiagonalCount < 2 || backwardDiagonalCount < 2) {
                            console.log(`DEBUG: Rejected match - not a true X shape (forward: ${forwardDiagonalCount}, backward: ${backwardDiagonalCount}, need 2+ each)`);
                            updateStatus(`Rejected match - not a true X (need 2+ lines in each diagonal direction)`, 'warn');
                            edges.delete();
                            lines.delete();
                            validationImageMat.delete();
                            return null;
                        }
                        
                        console.log(`DEBUG: Match passed line detection validation - found both diagonal directions (forward and backward)`);
                        updateStatus(`Validated: True X shape detected (both diagonal directions)`, 'info');
                        
                        // Clean up
                        edges.delete();
                        lines.delete();
                        validationImageMat.delete();
                    } catch (lineDetectionError) {
                        console.error('ERROR: Line detection validation failed:', lineDetectionError);
                        // If line detection fails, still accept the match (fallback to brightness validation only)
                        console.log(`DEBUG: Line detection failed, falling back to brightness validation only`);
                    }
                    
                    console.log(`DEBUG: Match passed brightness validation - accepting as potential X button`);
                }
            } catch (e) {
                console.error('ERROR validating match brightness:', e);
                // Continue anyway if validation fails
            }
            
            // Prioritize top-right matches
            const regionWidth = topRightRegion.width;
            const regionHeight = topRightRegion.height;
            const isTopRight = bestMatch.x > regionWidth * 0.6 && bestMatch.y < regionHeight * 0.4;
            
            const detectedMsg = `Detected X button at (${centerX}, ${centerY}) using OpenCV (score: ${bestScore.toFixed(3)}, topRight: ${isTopRight})`;
            console.log(`DEBUG: ${detectedMsg}`);
            updateStatus(detectedMsg, 'success');
            
            // Clean up imgMat before returning
            if (imgMat) {
                try {
                    imgMat.delete();
                } catch (e) {
                    console.error('ERROR cleaning up imgMat:', e);
                }
            }
            return { x: centerX, y: centerY, type: 'x' };
        }
        
        // If template matching didn't find a good match, try edge detection as fallback
        if (!bestMatch || bestScore < minThreshold) {
            console.log(`DEBUG: Template matching failed (best score: ${bestScore.toFixed(3)}), trying edge detection fallback...`);
            updateStatus(`Template matching failed, trying edge detection...`, 'info');
            
            // DISABLED: Edge detection fallback is too permissive and causes false positives
            // It was detecting signal icons, UI elements, etc. that aren't X buttons
            // Only use template matching which is more reliable
            console.log(`DEBUG: Edge detection fallback DISABLED - template matching must succeed (threshold: ${minThreshold})`);
            updateStatus(`Edge detection fallback disabled - only template matching used`, 'info');
            
            // OLD CODE COMMENTED OUT - too many false positives
            /*
            try {
                // Look for bright regions in top-right corner (where X buttons typically are)
                const regionWidth = topRightRegion.width;
                const regionHeight = topRightRegion.height;
                const topRightXStart = Math.floor(regionWidth * 0.6); // Right 40% of region
                const topRightYEnd = Math.floor(regionHeight * 0.4); // Top 40% of region
                
                // Scan top-right region for bright white areas
                let brightestX = topRightXStart;
                let brightestY = 0;
                let brightestValue = 0;
                
                // Check original image (not edges) for bright regions
                for (let y = 0; y < topRightYEnd; y++) {
                    for (let x = topRightXStart; x < regionWidth; x++) {
                        const pixelValue = imgMat.ucharPtr(y, x)[0];
                        if (pixelValue > brightestValue) {
                            brightestValue = pixelValue;
                            brightestX = x;
                            brightestY = y;
                        }
                    }
                }
                
                // If we found a very bright pixel in top-right, it might be an X button
                if (brightestValue > 180) {
                    console.log(`DEBUG: Edge detection fallback - found bright pixel at (${brightestX}, ${brightestY}) with value ${brightestValue}`);
                    updateStatus(`Edge detection found bright region at (${brightestX}, ${brightestY})`, 'info');
                    
                    // Validate this region has X-like characteristics
                    const validationSize = 25;
                    const checkX = Math.max(0, Math.min(regionWidth - validationSize, brightestX - validationSize / 2));
                    const checkY = Math.max(0, Math.min(regionHeight - validationSize, brightestY - validationSize / 2));
                    
                    // Count bright pixels in a small region around this point
                    let brightCount = 0;
                    let maxBright = 0;
                    for (let dy = 0; dy < validationSize && (checkY + dy) < regionHeight; dy++) {
                        for (let dx = 0; dx < validationSize && (checkX + dx) < regionWidth; dx++) {
                            const val = imgMat.ucharPtr(checkY + dy, checkX + dx)[0];
                            if (val > maxBright) maxBright = val;
                            if (val > 150) brightCount++;
                        }
                    }
                    
                    // If there are enough bright pixels, accept it as a potential X
                    // BUT: Validate that the Y coordinate is actually in the top region (not bottom of screen)
                    if (brightCount >= 10 && maxBright > 180) {
                        const centerX = topRightRegion.x + brightestX;
                        const centerY = topRightRegion.y + brightestY;
                        
                        // Safety check: X buttons should be in the top 300 pixels of screen
                        // If centerY is > 300, this is likely a false positive (maybe detecting boost box or other blue element)
                        if (centerY > 300) {
                            console.log(`DEBUG: Edge detection REJECTED - Y coordinate ${centerY} is too low (likely false positive, not an X button)`);
                            updateStatus(`Rejected edge detection - Y coordinate ${centerY} too low (not an X button)`, 'warn');
                            // Don't return - continue to return null below
                        } else {
                            console.log(`DEBUG: Edge detection accepted - X button at (${centerX}, ${centerY}), bright pixels: ${brightCount}`);
                            updateStatus(`Detected X button via edge detection at (${centerX}, ${centerY})`, 'success');
                            
                            // Clean up
                            if (imgMat) {
                                try {
                                    imgMat.delete();
                                } catch (e) {
                                    console.error('ERROR cleaning up imgMat:', e);
                                }
                            }
                            return { x: centerX, y: centerY, type: 'x', method: 'edge_detection' };
                        }
                    }
                }
            } catch (error) {
                console.error('ERROR: Edge detection fallback failed:', error);
            }
            */
        }
        
        // Clean up
        if (imgMat) {
            try {
                imgMat.delete();
            } catch (e) {
                console.error('ERROR cleaning up imgMat:', e);
            }
        }
        
        const notFoundMsg = `No X button found via OpenCV (best score: ${bestScore.toFixed(3)}, threshold: ${minThreshold})`;
        console.log(`DEBUG: ${notFoundMsg}`);
        if (bestScore > 0.2) { // Log if we got close
            updateStatus(notFoundMsg, 'warn');
        }
        return null;
    } catch (error) {
        console.error('ERROR: Failed to detect ad close button:', error);
        console.error('ERROR stack:', error.stack);
        return null;
    }
}

/**
 * Parse countdown string and convert to total minutes
 * Examples: "40m" -> 40, "1h 20m" -> 80, "7h 59m" -> 479
 * 
 * @param {string} countdownText - Countdown text from OCR (e.g., "40m", "1h 20m")
 * @returns {number|null} Total minutes or null if parsing fails
 */
function parseCountdownToMinutes(countdownText) {
    if (!countdownText) return null;
    
    try {
        // Clean up common OCR errors: replace 'S' with '5' when it appears in numeric contexts
        // Format is "xh xxm xxs" where x is a number, but OCR may misread "5" as "S"
        let cleanedText = countdownText;
        
        // Pattern: "7hS9m" or "7h S9m" or "7hS 9m" should become "7h 59m" or "7h59m"
        // The "S" between "h" and a digit before "m" is almost certainly a misread "5"
        cleanedText = cleanedText.replace(/h\s*S(\d+)\s*m/gi, 'h 5$1m'); // "hS9m" -> "h 59m", "h S9m" -> "h 59m"
        
        // Pattern: "7hS" followed by space and "m" should become "7h 5m" (single digit minutes)
        cleanedText = cleanedText.replace(/h\s*S\s*m/gi, 'h 5m'); // "hS m" -> "h 5m"
        
        // Also handle cases where S appears in seconds: "xxm Sxs" -> "xxm 5xs"
        cleanedText = cleanedText.replace(/m\s*S(\d+)\s*s/gi, 'm 5$1s'); // "mS8s" -> "m 58s"
        
        // Normalize spaces: ensure format is "xh xxm xxs" with single spaces
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
        
        console.log(`DEBUG: parseCountdownToMinutes - Original: "${countdownText}", Cleaned: "${cleanedText}"`);
        
        let totalMinutes = 0;
        
        // Extract hours (e.g., "7h" or "7 h")
        const hourMatch = cleanedText.match(/(\d+)\s*h/i);
        if (hourMatch) {
            totalMinutes += parseInt(hourMatch[1], 10) * 60;
        }
        
        // Extract minutes (e.g., "59m" or "59 m")
        const minuteMatch = cleanedText.match(/(\d+)\s*m/i);
        if (minuteMatch) {
            totalMinutes += parseInt(minuteMatch[1], 10);
        }
        
        // If no hours or minutes found, return null
        if (!hourMatch && !minuteMatch) {
            console.log(`DEBUG: parseCountdownToMinutes - No hours or minutes found in "${cleanedText}"`);
            return null;
        }
        
        console.log(`DEBUG: parseCountdownToMinutes - Parsed: ${totalMinutes} minutes (hours: ${hourMatch ? hourMatch[1] : 0}, minutes: ${minuteMatch ? minuteMatch[1] : 0})`);
        return totalMinutes;
    } catch (error) {
        console.error('ERROR: Failed to parse countdown:', error);
        return null;
    }
}

/**
 * Trigger ads function
 * Triggers ads repeatedly until countdown reaches at least 7h 59m (479 minutes)
 * 
 * @param {Object} dependencies - Dependencies object containing required functions
 * @returns {Promise<Object>} Result object with success status
 */
async function triggerAds(dependencies) {
    const { 
        performClick, 
        captureScreenRegion, 
        iphoneMirroringRegion, 
        updateStatus, 
        updateCurrentFunction, 
        CLICK_AREAS, 
        captureAndOCR,
        getIsAutomationPaused,
        getIsAdsRunning,
        waitIfPaused,
        showModal = true // Default to true for UI-initiated calls
    } = dependencies;
    
    updateCurrentFunction('triggerAds');
    updateStatus('Triggering ads until 7h 59m reached...', 'info');
    console.log('DEBUG: Starting ads trigger sequence - will loop until countdown >= 7h 59m');
    
    const TARGET_MINUTES = 7 * 60 + 59; // 479 minutes (7h 59m)
    let totalClicks = 0;
    let adNumber = 0;
    let xButtonClicks = []; // Track all X button clicks for consolidated display (accessible in all scenarios)
    
    try {
        // Initial check: Confirm boost button is present (we should be on game screen)
        updateStatus('Confirming boost button presence...', 'info');
        let boostBoxPresent = await detectBoostBox({ captureScreenRegion, captureAndOCR });
        
        if (!boostBoxPresent) {
            // Boost box not found - check if we're already in an ad
            updateStatus('Boost box not found - checking if already in ad...', 'info');
            console.log('DEBUG: Boost box not detected - checking countdown timer');
            
            // Check for countdown timer to see if we're in an ad
            const countdownText = await readAdCountdown({ captureScreenRegion, captureAndOCR, updateStatus, showModal });
            
            if (!countdownText) {
                // Neither boost box nor countdown found - assume we're in an ad
                updateStatus('Neither boost box nor countdown detected - assuming already in ad, continuously clicking X until stopped...', 'warn');
                console.log('DEBUG: Neither boost box nor countdown detected - assuming already in ad, will keep clicking X until stopped');
                
                // Capture baseline image for X detection
                const baselineImageDataUrl = await captureScreenRegion();
                if (!baselineImageDataUrl) {
                    return { success: false, error: 'Failed to capture baseline image for ad close detection' };
                }
                
                // Keep searching for and clicking X buttons until stopped or boost box appears
                let clickCount = 0;
                const maxTotalAttempts = 200; // Maximum total search attempts
                const delayBetweenAttempts = 200; // 200ms between attempts
                let totalAttempts = 0;
                
                while (totalAttempts < maxTotalAttempts) {
                    // Check if ads was stopped (escape key)
                    if (getIsAdsRunning && !getIsAdsRunning()) {
                        console.log('DEBUG: Ads automation stopped by user');
                        updateStatus('Ads automation stopped', 'warn');
                        return { success: false, error: 'Stopped by user', clicks: clickCount, alreadyInAd: true };
                    }
                    
                    // Check for pause/interrupt
                    if (getIsAutomationPaused && getIsAutomationPaused()) {
                        if (waitIfPaused) await waitIfPaused();
                    }
                    
                    // Check if boost button has reappeared (we're back in the game!)
                    const boostBoxPresent = await detectBoostBox({ captureScreenRegion, captureAndOCR });
                    if (boostBoxPresent) {
                        updateStatus(`Successfully exited ad - boost box present! (${clickCount} clicks)`, 'success');
                        console.log(`DEBUG: Successfully exited ad - boost box reappeared after ${clickCount} clicks`);
                        return { success: true, clicks: clickCount, adNumber: 0, alreadyInAd: true };
                    }
                    
                    // Log progress every 2 seconds (every 10 attempts)
                    if (totalAttempts % 10 === 0 && totalAttempts > 0) {
                        const elapsedSeconds = (totalAttempts * delayBetweenAttempts) / 1000;
                        console.log(`DEBUG: Still searching for ad close button... (${elapsedSeconds.toFixed(1)}s elapsed, ${clickCount} clicks)`);
                        updateStatus(`Searching for ad close button... (${elapsedSeconds.toFixed(0)}s, ${clickCount} clicks)`, 'info');
                    }
                    
                    // Detect button
                    const buttonFound = await detectAdCloseButton(
                        { captureScreenRegion, iphoneMirroringRegion, getIsAutomationPaused, waitIfPaused, updateStatus, showModal },
                        baselineImageDataUrl
                    );
                    
                    if (buttonFound) {
                        const elapsedSeconds = (totalAttempts * delayBetweenAttempts) / 1000;
                        console.log(`DEBUG: Found ${buttonFound.type} button at (${buttonFound.x}, ${buttonFound.y}) after ${elapsedSeconds.toFixed(1)}s`);
                        updateStatus(`Found ${buttonFound.type} button - clicking...`, 'info');
                        
                        // Capture screenshot of X button BEFORE clicking (when X is still visible)
                        let xButtonScreenshot = null;
                        if (showModal) {
                            try {
                                const { Monitor } = require('node-screenshots');
                                const monitors = Monitor.all();
                                const primaryMonitor = monitors.find(m => m.isPrimary);
                                
                                if (primaryMonitor) {
                                    const screenshotX = Math.max(0, Math.floor(buttonFound.x - 30));
                                    const screenshotY = Math.max(0, Math.floor(buttonFound.y - 30));
                                    const screenshotSize = 60;
                                    
                                    const screenshotImage = primaryMonitor.captureImageSync();
                                    const screenshotCrop = screenshotImage.cropSync(
                                        screenshotX,
                                        screenshotY,
                                        screenshotSize,
                                        screenshotSize
                                    );
                                    const screenshotBuffer = screenshotCrop.toPngSync();
                                    const base64String = screenshotBuffer.toString('base64');
                                    xButtonScreenshot = `data:image/png;base64,${base64String}`;
                                    console.log(`DEBUG: Captured X button screenshot BEFORE clicking (X still visible)`);
                                    
                                    // Also send it immediately for real-time feedback
                                    updateStatus(`screenshot|||X button clicked at (${buttonFound.x}, ${buttonFound.y})|||${xButtonScreenshot}`, 'info');
                                }
                            } catch (e) {
                                console.error(`ERROR: Failed to capture X button screenshot:`, e);
                            }
                        }
                        
                        // Store info about this X button click (for consolidated display at end)
                        xButtonClicks.push({
                            x: buttonFound.x,
                            y: buttonFound.y,
                            clickNumber: clickCount + 1,
                            screenshot: xButtonScreenshot // Store screenshot captured BEFORE clicking
                        });
                        
                        // Click the button
                        console.log(`DEBUG: Performing click at (${buttonFound.x}, ${buttonFound.y})`);
                        await performClick(buttonFound.x, buttonFound.y);
                        clickCount++;
                        updateStatus(`Clicked ${buttonFound.type} button (${clickCount} total)`, 'success');
                        
                        // Wait a bit for the click to register and screen to update
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // Check again if boost button appeared after clicking
                        const boostBoxAfterClick = await detectBoostBox({ captureScreenRegion });
                        if (boostBoxAfterClick) {
                            updateStatus(`Successfully exited ad - boost box present! (${clickCount} clicks)`, 'success');
                            console.log(`DEBUG: Successfully exited ad - boost box reappeared after ${clickCount} clicks`);
                            return { success: true, clicks: clickCount, adNumber: 0, alreadyInAd: true };
                        }
                    }
                    
                    // Small delay between detection attempts
                    await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
                    totalAttempts++;
                }
                
                // Timeout reached
                const totalElapsedSeconds = (maxTotalAttempts * delayBetweenAttempts) / 1000;
                updateStatus(`Timeout: No boost box detected after ${totalElapsedSeconds}s (${clickCount} clicks)`, 'warn');
                console.log(`DEBUG: No boost box detected after ${totalElapsedSeconds}s of searching (${clickCount} clicks)`);
                return { success: false, error: 'Timeout - could not exit ad', clicks: clickCount, alreadyInAd: true };
            } else {
                // Countdown found but no boost box - this is normal during an ad
                // Keep clicking X buttons until stopped or boost box appears
                updateStatus('Countdown detected but boost box not found - already in ad, continuously clicking X until stopped...', 'info');
                console.log(`DEBUG: Countdown detected: ${countdownText}, but boost box not found - will keep clicking X until stopped`);
                
                // Capture baseline image for X detection
                const baselineImageDataUrl = await captureScreenRegion();
                if (!baselineImageDataUrl) {
                    return { success: false, error: 'Failed to capture baseline image for ad close detection' };
                }
                
                // Keep searching for and clicking X buttons until stopped or boost box appears
                let clickCount = 0;
                const maxTotalAttempts = 200; // Maximum total search attempts
                const delayBetweenAttempts = 200; // 200ms between attempts
                let totalAttempts = 0;
                
                while (totalAttempts < maxTotalAttempts) {
                    // Check if ads was stopped (escape key)
                    if (getIsAdsRunning && !getIsAdsRunning()) {
                        console.log('DEBUG: Ads automation stopped by user');
                        updateStatus('Ads automation stopped', 'warn');
                        return { success: false, error: 'Stopped by user', clicks: clickCount, alreadyInAd: true };
                    }
                    
                    // Check for pause/interrupt
                    if (getIsAutomationPaused && getIsAutomationPaused()) {
                        if (waitIfPaused) await waitIfPaused();
                    }
                    
                    // Check if boost button has reappeared (we're back in the game!)
                    const boostBoxPresent = await detectBoostBox({ captureScreenRegion, captureAndOCR });
                    if (boostBoxPresent) {
                        updateStatus(`Successfully exited ad - boost box present! (${clickCount} clicks)`, 'success');
                        console.log(`DEBUG: Successfully exited ad - boost box reappeared after ${clickCount} clicks`);
                        return { success: true, clicks: clickCount, adNumber: 0, alreadyInAd: true };
                    }
                    
                    // Log progress every 2 seconds (every 10 attempts)
                    if (totalAttempts % 10 === 0 && totalAttempts > 0) {
                        const elapsedSeconds = (totalAttempts * delayBetweenAttempts) / 1000;
                        console.log(`DEBUG: Still searching for ad close button... (${elapsedSeconds.toFixed(1)}s elapsed, ${clickCount} clicks)`);
                        updateStatus(`Searching for ad close button... (${elapsedSeconds.toFixed(0)}s, ${clickCount} clicks)`, 'info');
                    }
                    
                    // Detect button
                    const buttonFound = await detectAdCloseButton(
                        { captureScreenRegion, iphoneMirroringRegion, getIsAutomationPaused, waitIfPaused, updateStatus, showModal },
                        baselineImageDataUrl
                    );
                    
                    if (buttonFound) {
                        const elapsedSeconds = (totalAttempts * delayBetweenAttempts) / 1000;
                        console.log(`DEBUG: Found ${buttonFound.type} button at (${buttonFound.x}, ${buttonFound.y}) after ${elapsedSeconds.toFixed(1)}s`);
                        updateStatus(`Found ${buttonFound.type} button - clicking...`, 'info');
                        
                        // Capture screenshot of X button BEFORE clicking (when X is still visible)
                        let xButtonScreenshot = null;
                        if (showModal) {
                            try {
                                const { Monitor } = require('node-screenshots');
                                const monitors = Monitor.all();
                                const primaryMonitor = monitors.find(m => m.isPrimary);
                                
                                if (primaryMonitor) {
                                    const screenshotX = Math.max(0, Math.floor(buttonFound.x - 30));
                                    const screenshotY = Math.max(0, Math.floor(buttonFound.y - 30));
                                    const screenshotSize = 60;
                                    
                                    const screenshotImage = primaryMonitor.captureImageSync();
                                    const screenshotCrop = screenshotImage.cropSync(
                                        screenshotX,
                                        screenshotY,
                                        screenshotSize,
                                        screenshotSize
                                    );
                                    const screenshotBuffer = screenshotCrop.toPngSync();
                                    const base64String = screenshotBuffer.toString('base64');
                                    xButtonScreenshot = `data:image/png;base64,${base64String}`;
                                    console.log(`DEBUG: Captured X button screenshot BEFORE clicking (X still visible)`);
                                    
                                    // Also send it immediately for real-time feedback
                                    updateStatus(`screenshot|||X button clicked at (${buttonFound.x}, ${buttonFound.y})|||${xButtonScreenshot}`, 'info');
                                }
                            } catch (e) {
                                console.error(`ERROR: Failed to capture X button screenshot:`, e);
                            }
                        }
                        
                        // Store info about this X button click (for consolidated display at end)
                        xButtonClicks.push({
                            x: buttonFound.x,
                            y: buttonFound.y,
                            clickNumber: clickCount + 1,
                            screenshot: xButtonScreenshot // Store screenshot captured BEFORE clicking
                        });
                        
                        // Click the button
                        console.log(`DEBUG: Performing click at (${buttonFound.x}, ${buttonFound.y})`);
                        await performClick(buttonFound.x, buttonFound.y);
                        clickCount++;
                        updateStatus(`Clicked ${buttonFound.type} button (${clickCount} total)`, 'success');
                        
                        // Wait a bit for the click to register and screen to update
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // Check again if boost button appeared after clicking
                        const boostBoxAfterClick = await detectBoostBox({ captureScreenRegion });
                        if (boostBoxAfterClick) {
                            updateStatus(`Successfully exited ad - boost box present! (${clickCount} clicks)`, 'success');
                            console.log(`DEBUG: Successfully exited ad - boost box reappeared after ${clickCount} clicks`);
                            return { success: true, clicks: clickCount, adNumber: 0, alreadyInAd: true };
                        }
                    }
                    
                    // Small delay between detection attempts
                    await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
                    totalAttempts++;
                }
                
                // Timeout reached
                const totalElapsedSeconds = (maxTotalAttempts * delayBetweenAttempts) / 1000;
                updateStatus(`Timeout: No boost box detected after ${totalElapsedSeconds}s (${clickCount} clicks)`, 'warn');
                console.log(`DEBUG: No boost box detected after ${totalElapsedSeconds}s of searching (${clickCount} clicks)`);
                return { success: false, error: 'Timeout - could not exit ad', clicks: clickCount, alreadyInAd: true };
            }
        }
        
        // Main loop: Keep triggering ads until countdown >= 7h 59m
        while (true) {
            // Check if ads was stopped (escape key)
            if (getIsAdsRunning && !getIsAdsRunning()) {
                console.log('DEBUG: Ads automation stopped by user');
                updateStatus('Ads automation stopped', 'warn');
                return { success: false, error: 'Stopped by user' };
            }
            
            // Check for pause/interrupt
            if (getIsAutomationPaused && getIsAutomationPaused()) {
                if (waitIfPaused) await waitIfPaused();
            }
            
            // CRITICAL: Verify we're NOT already in an ad before clicking AD_START_CLICK
            // An ad can't end on its own without at least one X click
            // So if boost box OR countdown is NOT present, we're still in an ad - don't click!
            // BOTH boost box AND countdown must be present to confirm we're on game screen
            updateStatus('Verifying we\'re on game screen before starting new ad (checking boost box and countdown)...', 'info');
            boostBoxPresent = await detectBoostBox({ captureScreenRegion, captureAndOCR });
            let countdownText = await readAdCountdown({ captureScreenRegion, captureAndOCR, updateStatus: null, showModal: false });
            const countdownPresent = countdownText && countdownText.trim().length > 0;
            
            console.log(`DEBUG: Pre-ad verification - boostBoxPresent: ${boostBoxPresent}, countdownPresent: ${countdownPresent}, countdownText: "${countdownText}"`);
            
            if (!boostBoxPresent || !countdownPresent) {
                // Either boost box or countdown not present - we're still in an ad!
                // This should never happen if we properly verified both after exiting previous ad
                // But if it does, we need to click X buttons until we're out
                const missingItems = [];
                if (!boostBoxPresent) missingItems.push('boost box');
                if (!countdownPresent) missingItems.push('countdown');
                updateStatus(`ERROR: ${missingItems.join(' and ')} not present - still in ad! Clicking X buttons until out...`, 'error');
                console.error(`ERROR: ${missingItems.join(' and ')} not present before starting new ad - we should not be here!`);
                console.error('ERROR: This means we exited the previous ad loop without properly verifying both boost box and countdown');
                
                // Keep clicking X buttons until both boost box and countdown appear
                let clickCount = 0;
                const maxTotalAttempts = 200;
                const delayBetweenAttempts = 200;
                let totalAttempts = 0;
                
                while (totalAttempts < maxTotalAttempts) {
                    // Check if ads was stopped
                    if (getIsAdsRunning && !getIsAdsRunning()) {
                        return { success: false, error: 'Stopped by user' };
                    }
                    
                    // Check for pause
                    if (getIsAutomationPaused && getIsAutomationPaused()) {
                        if (waitIfPaused) await waitIfPaused();
                    }
                    
                    // Check if both boost box and countdown appeared
                    boostBoxPresent = await detectBoostBox({ captureScreenRegion, captureAndOCR });
                    const countdownCheck = await readAdCountdown({ captureScreenRegion, captureAndOCR, updateStatus: null, showModal: false });
                    const countdownCheckPresent = countdownCheck && countdownCheck.trim().length > 0;
                    
                    if (boostBoxPresent && countdownCheckPresent) {
                        updateStatus(`Successfully exited ad - boost box and countdown present! (${clickCount} clicks)`, 'success');
                        console.log(`DEBUG: Successfully exited ad - both boost box and countdown reappeared after ${clickCount} clicks`);
                        break; // Exit this recovery loop
                    }
                    
                    // Detect and click X button
                    const baselineImageDataUrl = await captureScreenRegion();
                    const buttonFound = await detectAdCloseButton(
                        { captureScreenRegion, iphoneMirroringRegion, getIsAutomationPaused, waitIfPaused, updateStatus, showModal },
                        baselineImageDataUrl
                    );
                    
                    if (buttonFound) {
                        // Safety check: X buttons should NEVER be below y=300
                        if (buttonFound.y > 300) {
                            console.error(`ERROR: Rejected click at Y=${buttonFound.y} - too low for X button`);
                            await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
                            totalAttempts++;
                            continue;
                        }
                        
                        await performClick(buttonFound.x, buttonFound.y);
                        clickCount++;
                        updateStatus(`Clicked X button (${clickCount} total) - waiting for boost box and countdown...`, 'info');
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
                    totalAttempts++;
                }
                
                // If we still don't have both boost box and countdown, something is wrong
                boostBoxPresent = await detectBoostBox({ captureScreenRegion, captureAndOCR });
                const finalCountdownCheck = await readAdCountdown({ captureScreenRegion, captureAndOCR, updateStatus: null, showModal: false });
                const finalCountdownPresent = finalCountdownCheck && finalCountdownCheck.trim().length > 0;
                
                if (!boostBoxPresent || !finalCountdownPresent) {
                    const stillMissing = [];
                    if (!boostBoxPresent) stillMissing.push('boost box');
                    if (!finalCountdownPresent) stillMissing.push('countdown');
                    updateStatus(`ERROR: Could not exit ad - ${stillMissing.join(' and ')} never appeared`, 'error');
                    return { success: false, error: `Could not exit ad - ${stillMissing.join(' and ')} never appeared` };
                }
                
                // Wait a moment for screen to stabilize
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Re-check both boost box and countdown one more time before proceeding
                boostBoxPresent = await detectBoostBox({ captureScreenRegion, captureAndOCR });
                const recheckCountdown = await readAdCountdown({ captureScreenRegion, captureAndOCR, updateStatus: null, showModal: false });
                const recheckCountdownPresent = recheckCountdown && recheckCountdown.trim().length > 0;
                
                if (!boostBoxPresent || !recheckCountdownPresent) {
                    const disappeared = [];
                    if (!boostBoxPresent) disappeared.push('boost box');
                    if (!recheckCountdownPresent) disappeared.push('countdown');
                    updateStatus(`ERROR: ${disappeared.join(' and ')} disappeared again - aborting`, 'error');
                    return { success: false, error: `${disappeared.join(' and ')} disappeared again after recovery` };
                }
                
                updateStatus('Verified on game screen (boost box and countdown present) - proceeding to start new ad...', 'success');
            } else {
                updateStatus('Verified on game screen (boost box and countdown present) - proceeding to start new ad...', 'success');
            }
            
            // Only increment ad number when we're actually starting a new ad (after verifying we're on game screen)
            // This prevents incrementing when we continue due to errors
            adNumber++;
            updateStatus(`Starting ad #${adNumber}...`, 'info');
            console.log(`DEBUG: Starting ad #${adNumber} - boost box confirmed present`);
            
            // Capture baseline image of top region (before ad starts)
            const baselineImageDataUrl = await captureScreenRegion();
            if (!baselineImageDataUrl) {
                updateStatus(`Ad #${adNumber}: Failed to capture baseline image - retrying...`, 'warn');
                console.log('DEBUG: Failed to capture baseline image - will retry');
                adNumber--; // Decrement since we didn't actually start this ad
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
                continue;
            }
            
            // Click the ad start location (ONLY after confirming boost box is present)
            const adStartClick = CLICK_AREAS.AD_START_CLICK;
            console.log(`DEBUG: Clicking ad start location at (${adStartClick.x}, ${adStartClick.y}) - boost box confirmed present`);
            updateStatus(`Ad #${adNumber}: Clicking ad trigger button...`, 'info');
            await performClick(adStartClick.x, adStartClick.y);
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for ad to start loading
            
            // Keep searching for X buttons and clicking them until boost button reappears
            // Note: Ads often have multiple X buttons in sequence - keep clicking until we're back on game screen
            let clickCount = 0;
            const maxTotalAttempts = 200; // Maximum total search attempts per ad
            const delayBetweenAttempts = 200; // 200ms between attempts
            let boostBoxReappeared = false;
            // Reset X button clicks array for this ad
            xButtonClicks = [];
            
            // Keep clicking X buttons until boost box reappears (ads may have multiple X buttons)
            // This loop handles ads with multiple sequential X buttons - it's normal, not a failure
            while (!boostBoxReappeared) {
                let totalAttempts = 0;
                updateStatus(`Ad #${adNumber}: Searching for ad close buttons...`, 'info');
                
                while (totalAttempts < maxTotalAttempts && !boostBoxReappeared) {
                // Check if ads was stopped (escape key)
                if (getIsAdsRunning && !getIsAdsRunning()) {
                    console.log('DEBUG: Ads automation stopped by user');
                    updateStatus('Ads automation stopped', 'warn');
                    return { success: false, error: 'Stopped by user' };
                }
                
                // Check for pause/interrupt
                if (getIsAutomationPaused && getIsAutomationPaused()) {
                    if (waitIfPaused) await waitIfPaused();
                }
                
                // Log progress every 2 seconds (every 10 attempts)
                if (totalAttempts % 10 === 0 && totalAttempts > 0) {
                    const elapsedSeconds = (totalAttempts * delayBetweenAttempts) / 1000;
                    console.log(`DEBUG: Still searching for ad close button... (${elapsedSeconds.toFixed(1)}s elapsed, ${clickCount} clicks)`);
                    updateStatus(`Ad #${adNumber}: Searching... (${elapsedSeconds.toFixed(0)}s, ${clickCount} clicks)`, 'info');
                }
                
                // Detect button
                const buttonFound = await detectAdCloseButton(
                    { captureScreenRegion, iphoneMirroringRegion, getIsAutomationPaused, waitIfPaused, updateStatus, showModal },
                    baselineImageDataUrl
                );
                
                if (buttonFound) {
                    const elapsedSeconds = (totalAttempts * delayBetweenAttempts) / 1000;
                    console.log(`DEBUG: Found ${buttonFound.type} button at (${buttonFound.x}, ${buttonFound.y}) after ${elapsedSeconds.toFixed(1)}s`);
                    
                    // Capture screenshot of X button BEFORE clicking (when X is still visible)
                    let xButtonScreenshot = null;
                    if (showModal) {
                        try {
                            const { Monitor } = require('node-screenshots');
                            const monitors = Monitor.all();
                            const primaryMonitor = monitors.find(m => m.isPrimary);
                            
                            if (primaryMonitor) {
                                const screenshotX = Math.max(0, Math.floor(buttonFound.x - 30));
                                const screenshotY = Math.max(0, Math.floor(buttonFound.y - 30));
                                const screenshotSize = 60;
                                
                                const screenshotImage = primaryMonitor.captureImageSync();
                                const screenshotCrop = screenshotImage.cropSync(
                                    screenshotX,
                                    screenshotY,
                                    screenshotSize,
                                    screenshotSize
                                );
                                const screenshotBuffer = screenshotCrop.toPngSync();
                                const base64String = screenshotBuffer.toString('base64');
                                xButtonScreenshot = `data:image/png;base64,${base64String}`;
                                console.log(`DEBUG: Captured X button screenshot BEFORE clicking (X still visible)`);
                            }
                        } catch (e) {
                            console.error(`ERROR: Failed to capture X button screenshot:`, e);
                        }
                    }
                    
                    // Store info about this X button click (for consolidated display at end)
                    xButtonClicks.push({
                        x: buttonFound.x,
                        y: buttonFound.y,
                        clickNumber: clickCount + 1,
                        screenshot: xButtonScreenshot // Store screenshot captured BEFORE clicking
                    });
                    
                    // Click the button
                    console.log(`DEBUG: Performing click at (${buttonFound.x}, ${buttonFound.y}) - method: ${buttonFound.method || 'template_matching'}, region: topRightRegion (y: 80-290)`);
                    // Safety check: X buttons should NEVER be below y=300
                    if (buttonFound.y > 300) {
                        console.error(`ERROR: Attempting to click at Y=${buttonFound.y} which is too low! This is likely a false positive. Rejecting click.`);
                        updateStatus(`ERROR: Rejected click at Y=${buttonFound.y} - too low for X button`, 'error');
                        continue; // Skip this click
                    }
                    await performClick(buttonFound.x, buttonFound.y);
                    clickCount++;
                    totalClicks++;
                    
                    // Wait a bit for the click to register and screen to update
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Check again if boost button appeared after clicking
                    boostBoxReappeared = await detectBoostBox({ captureScreenRegion });
                    if (boostBoxReappeared) {
                        console.log(`DEBUG: Successfully exited ad #${adNumber} - boost box reappeared after ${clickCount} clicks`);
                        break;
                    }
                } else {
                    // No button found - check if boost box reappeared (maybe ad closed itself)
                    // But only check occasionally to avoid false positives (every 5 attempts = 1 second)
                    if (totalAttempts > 0 && totalAttempts % 5 === 0) {
                        boostBoxReappeared = await detectBoostBox({ captureScreenRegion });
                        if (boostBoxReappeared) {
                            // Don't show message here - will show consolidated message after countdown check
                            console.log(`DEBUG: Successfully exited ad #${adNumber} - boost box reappeared (ad may have closed itself)`);
                            break;
                        }
                    }
                }
                
                    // Small delay between detection attempts
                    await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
                    totalAttempts++;
                }
                
                // If we exited the inner loop without boost box reappearing, we've timed out
                if (!boostBoxReappeared) {
                    const totalElapsedSeconds = (maxTotalAttempts * delayBetweenAttempts) / 1000;
                    updateStatus(`Ad #${adNumber}: Timeout - No boost box detected after ${totalElapsedSeconds}s`, 'warn');
                    console.log(`DEBUG: Ad #${adNumber} timeout - no boost box detected after ${totalElapsedSeconds}s`);
                    return { 
                        success: false, 
                        error: `Ad #${adNumber} timeout - failed to exit ad`,
                        clicks: totalClicks,
                        adNumber: adNumber
                    };
                }
                
                // Wait a moment for the screen to stabilize after exiting ad
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Verify we're actually back on the game screen by checking boost box again
                // Note: Ads often have multiple X buttons in sequence - this is normal, not a failure
                const boostBoxStillPresent = await detectBoostBox({ captureScreenRegion });
                if (!boostBoxStillPresent) {
                    // Boost box not present - we might still be clicking through multiple X buttons
                    // This is normal ad behavior, not a failure - restart the search loop
                    updateStatus(`Ad #${adNumber}: Still in ad (clicking through multiple X buttons)...`, 'info');
                    console.log('DEBUG: Boost box not present - still clicking through ad X buttons (this is normal)');
                    // Reset and continue the outer loop to search for more X buttons
                    boostBoxReappeared = false;
                    continue; // Continue outer loop to restart X button search
                }
                
                // Boost box is confirmed present - we've successfully exited the ad
                break; // Exit the outer loop and proceed to countdown check
            }
            
            // Read countdown timer (don't send screenshot yet - we'll send it in the right order)
            // Reuse countdownText variable (already declared in pre-ad verification)
            countdownText = await readAdCountdown({ captureScreenRegion, captureAndOCR, updateStatus: null, showModal: false });
            if (countdownText) {
                console.log(`DEBUG: Ad #${adNumber} countdown timer: ${countdownText}`);
                const countdownMinutes = parseCountdownToMinutes(countdownText);
                
                if (countdownMinutes !== null) {
                    const hours = Math.floor(countdownMinutes / 60);
                    const minutes = countdownMinutes % 60;
                    
                    console.log(`DEBUG: Ad #${adNumber} successfully exited - countdown confirmed: ${countdownText}`);
                    
                    // Show consolidated end-of-ad information in order:
                    // 1. All X button clicks (with screenshots) - FIRST
                    // Display all X button screenshots in a horizontal row with numbers
                    if (xButtonClicks.length > 0 && showModal) {
                        console.log(`DEBUG: Sending ${xButtonClicks.length} X button screenshots for ad #${adNumber}`);
                        // Send all screenshots in a single message with a special format for horizontal display
                        const screenshotsData = xButtonClicks.map((click, index) => ({
                            number: index + 1,
                            screenshot: click.screenshot,
                            coords: `(${click.x}, ${click.y})`
                        })).filter(item => item.screenshot); // Only include items with screenshots
                        
                        if (screenshotsData.length > 0) {
                            // Send a special message that will be parsed to show all screenshots horizontally
                            updateStatus(`x-screenshots|||Ad #${adNumber}: ${screenshotsData.length} X buttons clicked|||${JSON.stringify(screenshotsData)}`, 'info');
                        }
                    } else {
                        console.log(`DEBUG: Not sending X screenshots - xButtonClicks: ${xButtonClicks.length}, showModal: ${showModal}`);
                    }
                    
                    // 2. Countdown screenshot - SECOND (send manually in correct order)
                    if (showModal) {
                        try {
                            const sharp = require('sharp');
                            const fullScreenDataUrl = await captureScreenRegion();
                            if (fullScreenDataUrl) {
                                const base64Data = fullScreenDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
                                const imageBuffer = Buffer.from(base64Data, 'base64');
                                
                                const countdownRegion = {
                                    x: 195,
                                    y: 979,
                                    width: 272 - 195,
                                    height: 1002 - 983
                                };
                                
                                const rawCroppedBuffer = await sharp(imageBuffer)
                                    .extract({ 
                                        left: countdownRegion.x, 
                                        top: countdownRegion.y, 
                                        width: countdownRegion.width, 
                                        height: countdownRegion.height 
                                    })
                                    .png()
                                    .toBuffer();
                                
                                const countdownBase64 = rawCroppedBuffer.toString('base64');
                                const countdownDataUrl = `data:image/png;base64,${countdownBase64}`;
                                updateStatus(`screenshot|||Countdown: "${countdownText}"|||${countdownDataUrl}`, 'info');
                                console.log(`DEBUG: Sent countdown screenshot to modal`);
                            }
                        } catch (e) {
                            console.error('ERROR: Failed to send countdown screenshot:', e);
                        }
                    }
                    
                    // 3. Completion message (consolidated) - LAST
                    const clicksForThisAd = xButtonClicks.length;
                    if (countdownMinutes >= TARGET_MINUTES) {
                        updateStatus(`Ad #${adNumber} complete (${clicksForThisAd} clicks): ${hours}h ${minutes}m remaining - Target reached!`, 'success');
                        console.log(`DEBUG: Target reached! Countdown: ${countdownMinutes} minutes >= ${TARGET_MINUTES} minutes`);
                        return {
                            success: true,
                            clicks: totalClicks,
                            adNumber: adNumber,
                            countdown: countdownText,
                            countdownMinutes: countdownMinutes
                        };
                    } else {
                        const remainingMinutes = TARGET_MINUTES - countdownMinutes;
                        const remainingHours = Math.floor(remainingMinutes / 60);
                        const remainingMins = remainingMinutes % 60;
                        updateStatus(`Ad #${adNumber} complete (${clicksForThisAd} clicks): ${hours}h ${minutes}m remaining (need ${remainingHours}h ${remainingMins}m more)`, 'success');
                        console.log(`DEBUG: Need more ads: ${countdownMinutes} minutes < ${TARGET_MINUTES} minutes (need ${remainingMinutes} more)`);
                        // Continue loop to trigger another ad
                    }
                } else {
                    updateStatus(`Ad #${adNumber}: Could not parse countdown "${countdownText}" - retrying ad #${adNumber}...`, 'warn');
                    console.log(`DEBUG: Could not parse countdown: "${countdownText}"`);
                    // Don't increment ad number - retry the same ad
                    adNumber--; // Decrement since we didn't successfully complete this ad
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                    continue;
                }
            } else {
                updateStatus(`Ad #${adNumber}: Countdown not detected - verifying we're on game screen...`, 'warn');
                console.log('DEBUG: No countdown detected after ad closure - verifying boost box still present');
                // Double-check boost box is still present
                const boostBoxRecheck = await detectBoostBox({ captureScreenRegion });
                if (!boostBoxRecheck) {
                    updateStatus(`Ad #${adNumber}: Boost box disappeared - may still be in ad, retrying ad #${adNumber}...`, 'warn');
                    console.log('DEBUG: Boost box disappeared - may still be in ad, will retry same ad');
                    // Don't increment ad number - retry the same ad
                    adNumber--; // Decrement since we didn't successfully complete this ad
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                } else {
                    updateStatus(`Ad #${adNumber}: Boost box present but countdown not readable - retrying ad #${adNumber}...`, 'warn');
                    console.log('DEBUG: Boost box present but countdown not readable - will retry same ad');
                    // Don't increment ad number - retry the same ad
                    adNumber--; // Decrement since we didn't successfully complete this ad
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                }
                continue;
            }
        }
    } catch (error) {
        console.error('ERROR: Ads trigger failed:', error);
        updateStatus('Ads trigger failed', 'error');
        return { 
            success: false, 
            error: error.message,
            clicks: totalClicks,
            adNumber: adNumber
        };
    }
}

module.exports = {
    triggerAds,
    detectBoostBox,
    readAdCountdown,
    parseCountdownToMinutes
};

