# 📱 iPhone Game Automation Tool

A lightweight, Electron-based automation tool designed specifically for iPhone mirroring applications. Perfect for automating repetitive tasks in mobile games without requiring a Python server.

## ✨ Features

- **Screen Capture**: Capture specific regions or full screen
- **Color Detection**: Find specific colors on screen with adjustable tolerance
- **Advanced Image Processing**: Pure JavaScript implementation with OpenCV-like features
- **Mouse Automation**: Click at precise coordinates
- **Keyboard Input**: Type text and tap keys
- **Script Automation**: Write custom automation scripts
- **Live Preview**: Real-time screen capture preview
- **Global Shortcuts**: Quick access with keyboard shortcuts
- **Cross-platform**: Works on macOS, Windows, and Linux
- **No Python Server**: Lightweight Electron-based solution

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- iPhone mirroring app (like LonelyScreen, Reflector, or AirServer)

### Installation

1. **Clone or download this project**
   ```bash
   git clone <repository-url>
   cd iphone-game-automation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

### Development Mode

For development with DevTools:
```bash
npm run dev
```

## 🎮 Usage Guide

### 1. Setup iPhone Mirroring

1. Connect your iPhone to the same WiFi network as your computer
2. Open your preferred mirroring app (LonelyScreen, Reflector, etc.)
3. On your iPhone, use AirPlay to mirror to your computer
4. Position the mirrored iPhone window where you want to capture

### 2. Configure Capture Region

1. Set the X, Y coordinates of your iPhone window
2. Set the width and height to match your iPhone display
3. Common iPhone dimensions:
   - iPhone 14 Pro: 393x852
   - iPhone 14: 390x844
   - iPhone 13: 390x844

### 3. Basic Automation

#### Screen Capture
- Click "Capture Screen" to take a single screenshot
- Use "Start Continuous" for real-time monitoring
- Adjust the capture region as needed

#### Color Detection
1. Select a target color using the color picker
2. Adjust tolerance (0-255) for color matching
3. Click "Find Color" to locate the color on screen
4. The tool will highlight found colors with markers

#### Mouse Actions
1. Enter X, Y coordinates
2. Click "Click Position" to simulate a mouse click
3. Use the live preview to find exact coordinates

#### Keyboard Actions
- Type text directly into input fields
- Tap specific keys (space, enter, arrow keys, etc.)

### 4. Advanced Scripting

Write custom automation scripts in the script editor:

```javascript
// Example: Find and click a red button
const redButton = await findColor(
    {x: 0, y: 0, width: 800, height: 600}, 
    {r: 255, g: 0, b: 0}, 
    20
);
if (redButton) {
    updateStatus('Found red button, clicking...');
    await click(redButton.x, redButton.y);
} else {
    updateStatus('Red button not found');
}
```

### 5. Global Shortcuts

- `⌘+Shift+C` (Mac) / `Ctrl+Shift+C` (Windows/Linux): Quick capture
- `⌘+Shift+X` (Mac) / `Ctrl+Shift+X` (Windows/Linux): Stop all automation

## 🎯 Common Use Cases

### Mobile Game Automation

1. **Auto-clicking**: Set up scripts to click at specific intervals
2. **Color-based actions**: Detect game elements by color and respond
3. **Text input**: Automate form filling or chat messages
4. **Pattern recognition**: Find and click on specific UI elements

### Example Scripts

#### Auto Clicker
```javascript
// Click every 2 seconds for 10 seconds
for (let i = 0; i < 5; i++) {
    await click(400, 300);
    updateStatus(`Click ${i + 1}/5`);
    await new Promise(resolve => setTimeout(resolve, 2000));
}
```

#### Color Detection Loop
```javascript
// Continuously look for a specific color
for (let i = 0; i < 10; i++) {
    const target = await findColor(
        {x: 0, y: 0, width: 800, height: 600},
        {r: 0, g: 255, b: 0}, // Green
        15
    );
    
    if (target) {
        updateStatus('Found green target!');
        await click(target.x, target.y);
        break;
    }
    
    updateStatus(`Search attempt ${i + 1}/10`);
    await new Promise(resolve => setTimeout(resolve, 1000));
}
```

## 🔧 Technical Details

### Architecture

- **Electron**: Cross-platform desktop application framework
- **@nut-tree-fork/nut-js**: Modern native system automation (mouse, keyboard, screen capture)
- **Jimp**: Image processing and manipulation
- **Custom ImageProcessor**: Pure JavaScript OpenCV-like functionality
- **HTML5 Canvas**: Real-time preview and overlay rendering

### API Functions

Available in automation scripts:

- `findColor(region, color, tolerance)`: Find color in specified region
- `click(x, y)`: Click at coordinates
- `type(text)`: Type text
- `keyTap(key)`: Tap specific key
- `captureScreen(region)`: Capture screen region
- `updateStatus(message)`: Update status display

### Performance Tips

1. **Optimize capture region**: Only capture the area you need
2. **Adjust color tolerance**: Use higher tolerance for better detection
3. **Use continuous capture sparingly**: It can impact performance
4. **Close unnecessary applications**: Free up system resources

## 🛠️ Troubleshooting

### Common Issues

1. **Screen capture not working**
   - Ensure you have proper permissions
   - On macOS, grant screen recording permissions in System Preferences
   - On Windows, run as administrator if needed

2. **Color detection inaccurate**
   - Adjust tolerance value
   - Check for screen brightness/contrast changes
   - Use the color picker to verify target color

3. **Clicks not registering**
   - Verify coordinates are within the capture region
   - Check if the target application is in focus
   - Ensure no other automation tools are running

4. **Performance issues**
   - Reduce capture region size
   - Increase capture interval
   - Close other resource-intensive applications

### Platform-Specific Notes

#### macOS
- Requires screen recording permissions
- Works best with native mirroring apps
- Supports global shortcuts natively

#### Windows
- May require running as administrator
- Use Windows Game Bar or third-party mirroring apps
- Global shortcuts work with most applications

#### Linux
- May require additional dependencies
- Use tools like VNC or third-party mirroring apps
- Global shortcuts may need configuration

## 📦 Building

### Create Executable

```bash
npm run build
```

This creates platform-specific executables in the `dist` folder.

### Package for Distribution

```bash
npm run pack
```

Creates a packaged application without installer.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## ⚠️ Disclaimer

This tool is for educational and personal use only. Please respect the terms of service of any applications you automate. The authors are not responsible for any misuse of this software.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review existing GitHub issues
3. Create a new issue with detailed information

---

**Happy Automating! 🎮✨**
