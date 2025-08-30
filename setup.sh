#!/bin/bash

# iPhone Game Automation Tool Setup Script
echo "📱 Setting up iPhone Game Automation Tool..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16 or higher first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm version: $(npm -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
else
    echo "❌ Failed to install dependencies. Please check the error messages above."
    exit 1
fi

# Create assets directory if it doesn't exist
if [ ! -d "assets" ]; then
    mkdir -p assets
    echo "✅ Created assets directory"
fi

# Make the script executable
chmod +x setup.sh

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "🚀 To start the application:"
echo "   npm start"
echo ""
echo "🔧 For development mode:"
echo "   npm run dev"
echo ""
echo "📋 Next steps:"
echo "   1. Start your iPhone mirroring app (LonelyScreen, Reflector, etc.)"
echo "   2. Mirror your iPhone to your computer"
echo "   3. Run 'npm start' to launch the automation tool"
echo "   4. Configure the capture region to match your iPhone window"
echo "   5. Start automating!"
echo ""
echo "📖 For more information, see README.md"

