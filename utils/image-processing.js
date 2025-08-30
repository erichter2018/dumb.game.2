// Pure JavaScript Image Processing Utilities
// Provides OpenCV-like functionality for color detection and image analysis

class ImageProcessor {
  constructor() {
    this.debug = false;
  }

  // Convert image data to RGB array
  imageDataToRGB(imageData) {
    const rgb = [];
    for (let i = 0; i < imageData.data.length; i += 4) {
      rgb.push({
        r: imageData.data[i],
        g: imageData.data[i + 1],
        b: imageData.data[i + 2],
        a: imageData.data[i + 3]
      });
    }
    return rgb;
  }

  // Find color in image with tolerance
  findColor(imageData, targetColor, tolerance = 10) {
    const rgb = this.imageDataToRGB(imageData);
    const width = imageData.width;
    const height = imageData.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const pixel = rgb[index];

        if (this.colorMatch(pixel, targetColor, tolerance)) {
          return { x, y };
        }
      }
    }

    return null;
  }

  // Find all instances of a color
  findAllColors(imageData, targetColor, tolerance = 10) {
    const rgb = this.imageDataToRGB(imageData);
    const width = imageData.width;
    const height = imageData.height;
    const matches = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const pixel = rgb[index];

        if (this.colorMatch(pixel, targetColor, tolerance)) {
          matches.push({ x, y });
        }
      }
    }

    return matches;
  }

  // Check if two colors match within tolerance
  colorMatch(color1, color2, tolerance) {
    return Math.abs(color1.r - color2.r) <= tolerance &&
           Math.abs(color1.g - color2.g) <= tolerance &&
           Math.abs(color1.b - color2.b) <= tolerance;
  }

  // Find color clusters (groups of similar colors)
  findColorClusters(imageData, targetColor, tolerance = 10, minClusterSize = 5) {
    const matches = this.findAllColors(imageData, targetColor, tolerance);
    return this.clusterPoints(matches, minClusterSize);
  }

  // Cluster nearby points together
  clusterPoints(points, minClusterSize = 5, maxDistance = 50) {
    const clusters = [];
    const visited = new Set();

    for (const point of points) {
      if (visited.has(`${point.x},${point.y}`)) continue;

      const cluster = this.expandCluster(point, points, visited, maxDistance);
      if (cluster.length >= minClusterSize) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  // Expand a cluster from a starting point
  expandCluster(startPoint, allPoints, visited, maxDistance) {
    const cluster = [startPoint];
    visited.add(`${startPoint.x},${startPoint.y}`);

    for (const point of allPoints) {
      if (visited.has(`${point.x},${point.y}`)) continue;

      const distance = this.euclideanDistance(startPoint, point);
      if (distance <= maxDistance) {
        cluster.push(point);
        visited.add(`${point.x},${point.y}`);
      }
    }

    return cluster;
  }

  // Calculate Euclidean distance between two points
  euclideanDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Get center point of a cluster
  getClusterCenter(cluster) {
    const sumX = cluster.reduce((sum, point) => sum + point.x, 0);
    const sumY = cluster.reduce((sum, point) => sum + point.y, 0);
    return {
      x: Math.round(sumX / cluster.length),
      y: Math.round(sumY / cluster.length)
    };
  }

  // Template matching (simple correlation-based)
  templateMatch(imageData, templateData, threshold = 0.8) {
    const imageWidth = imageData.width;
    const imageHeight = imageData.height;
    const templateWidth = templateData.width;
    const templateHeight = templateData.height;

    const bestMatch = {
      x: 0,
      y: 0,
      correlation: 0
    };

    for (let y = 0; y <= imageHeight - templateHeight; y++) {
      for (let x = 0; x <= imageWidth - templateWidth; x++) {
        const correlation = this.calculateCorrelation(
          imageData, templateData, x, y
        );

        if (correlation > bestMatch.correlation) {
          bestMatch.x = x;
          bestMatch.y = y;
          bestMatch.correlation = correlation;
        }
      }
    }

    return bestMatch.correlation >= threshold ? bestMatch : null;
  }

  // Calculate correlation between image region and template
  calculateCorrelation(imageData, templateData, startX, startY) {
    const templateWidth = templateData.width;
    const templateHeight = templateData.height;
    let correlation = 0;
    let count = 0;

    for (let y = 0; y < templateHeight; y++) {
      for (let x = 0; x < templateWidth; x++) {
        const imageIndex = ((startY + y) * imageData.width + (startX + x)) * 4;
        const templateIndex = (y * templateWidth + x) * 4;

        const imagePixel = {
          r: imageData.data[imageIndex],
          g: imageData.data[imageIndex + 1],
          b: imageData.data[imageIndex + 2]
        };

        const templatePixel = {
          r: templateData.data[templateIndex],
          g: templateData.data[templateIndex + 1],
          b: templateData.data[templateIndex + 2]
        };

        // Simple correlation based on color similarity
        const similarity = this.colorSimilarity(imagePixel, templatePixel);
        correlation += similarity;
        count++;
      }
    }

    return count > 0 ? correlation / count : 0;
  }

  // Calculate color similarity (0-1)
  colorSimilarity(color1, color2) {
    const maxDiff = 255 * 3;
    const diff = Math.abs(color1.r - color2.r) +
                 Math.abs(color1.g - color2.g) +
                 Math.abs(color1.b - color2.b);
    return 1 - (diff / maxDiff);
  }

  // Edge detection using Sobel operator
  detectEdges(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const output = new ImageData(width, height);

    // Convert to grayscale first
    const grayscale = this.toGrayscale(imageData);

    // Sobel operators
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;

        // Apply Sobel operators
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = grayscale[(y + ky) * width + (x + kx)];
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            gx += pixel * sobelX[kernelIndex];
            gy += pixel * sobelY[kernelIndex];
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const edgeValue = Math.min(255, magnitude);

        const index = (y * width + x) * 4;
        output.data[index] = edgeValue;     // R
        output.data[index + 1] = edgeValue; // G
        output.data[index + 2] = edgeValue; // B
        output.data[index + 3] = 255;       // A
      }
    }

    return output;
  }

  // Convert image to grayscale
  toGrayscale(imageData) {
    const grayscale = new Uint8Array(imageData.width * imageData.height);
    
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      
      // Luminance formula
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      grayscale[i / 4] = Math.round(gray);
    }

    return grayscale;
  }

  // Find contours in binary image
  findContours(binaryImageData) {
    const width = binaryImageData.width;
    const height = binaryImageData.height;
    const visited = new Set();
    const contours = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const pixel = binaryImageData.data[index * 4];

        if (pixel > 128 && !visited.has(index)) {
          const contour = this.traceContour(binaryImageData, x, y, visited);
          if (contour.length > 10) { // Minimum contour size
            contours.push(contour);
          }
        }
      }
    }

    return contours;
  }

  // Trace a contour starting from a point
  traceContour(imageData, startX, startY, visited) {
    const contour = [];
    const width = imageData.width;
    const height = imageData.height;
    
    // 8-directional search
    const directions = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    let currentX = startX;
    let currentY = startY;
    let maxSteps = width * height; // Prevent infinite loops
    let steps = 0;

    while (steps < maxSteps) {
      const index = currentY * width + currentX;
      visited.add(index);
      contour.push({ x: currentX, y: currentY });

      let found = false;
      for (const [dx, dy] of directions) {
        const nextX = currentX + dx;
        const nextY = currentY + dy;

        if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
          const nextIndex = nextY * width + nextX;
          const nextPixel = imageData.data[nextIndex * 4];

          if (nextPixel > 128 && !visited.has(nextIndex)) {
            currentX = nextX;
            currentY = nextY;
            found = true;
            break;
          }
        }
      }

      if (!found) break;
      steps++;
    }

    return contour;
  }

  // Get bounding box of a contour
  getContourBoundingBox(contour) {
    if (contour.length === 0) return null;

    let minX = contour[0].x, maxX = contour[0].x;
    let minY = contour[0].y, maxY = contour[0].y;

    for (const point of contour) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  // Calculate contour area
  calculateContourArea(contour) {
    if (contour.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      area += contour[i].x * contour[j].y;
      area -= contour[j].x * contour[i].y;
    }

    return Math.abs(area) / 2;
  }

  // Find shapes in image
  findShapes(imageData, minArea = 100) {
    const edges = this.detectEdges(imageData);
    const contours = this.findContours(edges);
    const shapes = [];

    for (const contour of contours) {
      const area = this.calculateContourArea(contour);
      if (area >= minArea) {
        const boundingBox = this.getContourBoundingBox(contour);
        const center = {
          x: boundingBox.x + boundingBox.width / 2,
          y: boundingBox.y + boundingBox.height / 2
        };

        shapes.push({
          contour,
          area,
          boundingBox,
          center
        });
      }
    }

    return shapes;
  }
}

module.exports = ImageProcessor;

