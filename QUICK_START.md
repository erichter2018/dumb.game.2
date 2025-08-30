# 🚀 Quick Start Guide

## Your iPhone Game Automation Tool is Ready!

### ✅ What's Working
- ✅ Screen capture and automation
- ✅ Color detection with tolerance
- ✅ Mouse clicking and keyboard input
- ✅ Pure JavaScript image processing (OpenCV-like features)
- ✅ Cross-platform compatibility
- ✅ No Python server required

### 🎮 How to Use

1. **Start Your iPhone Mirroring**
   - Use LonelyScreen, Reflector, AirServer, or any mirroring app
   - Mirror your iPhone to your computer
   - Position the iPhone window where you want to capture

2. **Launch the Automation Tool**
   ```bash
   npm start
   ```

3. **Configure Capture Region**
   - Set X, Y coordinates of your iPhone window
   - Set width and height to match your iPhone display
   - Common iPhone dimensions:
     - iPhone 14 Pro: 393x852
     - iPhone 14: 390x844
     - iPhone 13: 390x844

4. **Start Automating**
   - Use "Capture Screen" to test
   - Use "Find Color" to detect game elements
   - Write custom scripts in the script editor
   - Use global shortcuts: `⌘+Shift+C` (capture), `⌘+Shift+X` (stop)

### 🎯 Example Use Cases

#### Auto-Clicker for Tapping Games
```javascript
// Click every 1 second for 30 seconds
for (let i = 0; i < 30; i++) {
    await click(400, 300);
    updateStatus(`Auto-click ${i + 1}/30`);
    await new Promise(resolve => setTimeout(resolve, 1000));
}
```

#### Color-Based Button Detection
```javascript
// Find and click a red button
const redButton = await findColor(
    {x: 0, y: 0, width: 800, height: 600}, 
    {r: 255, g: 0, b: 0}, // Red
    30 // Tolerance
);
if (redButton) {
    await click(redButton.x, redButton.y);
}
```

#### Continuous Monitoring
```javascript
// Monitor for a specific color and click when found
for (let i = 0; i < 60; i++) {
    const target = await findColor(
        {x: 0, y: 0, width: 800, height: 600},
        {r: 0, g: 255, b: 0}, // Green
        20
    );
    
    if (target) {
        await click(target.x, target.y);
        await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
```

### 🔧 Troubleshooting

**Screen capture not working?**
- On macOS: Grant screen recording permissions in System Preferences
- On Windows: Run as administrator if needed
- Ensure your mirroring app is active

**Color detection inaccurate?**
- Adjust tolerance value (higher = more flexible)
- Use the color picker to verify target color
- Check for screen brightness changes

**Clicks not registering?**
- Verify coordinates are within capture region
- Ensure target application is in focus
- Check if other automation tools are running

### 📁 Project Structure
```
iphone-game-automation/
├── main.js                 # Main Electron process
├── index.html             # User interface
├── renderer.js            # Frontend logic
├── styles.css             # UI styling
├── utils/
│   └── image-processing.js # OpenCV-like features
├── examples/
│   └── game-automation-examples.js
└── README.md              # Full documentation
```

### 🎉 You're All Set!

Your lightweight, Python-free automation tool is ready to help you automate iPhone games. The tool includes advanced image processing capabilities and is designed to be fast, reliable, and easy to use.

**Happy Automating! 🎮✨**

