#!/bin/bash

# BlueLink APK Build Script for Linux
# This script automates the entire APK building process

set -e

echo "🔵 BlueLink APK Builder - Linux"
echo "================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if Java is installed
echo "Checking prerequisites..."
if ! command -v java &> /dev/null; then
    print_error "Java is not installed!"
    echo ""
    echo "Install Java 11 or higher:"
    echo "  Ubuntu/Debian: sudo apt-get install openjdk-11-jdk"
    echo "  Fedora: sudo dnf install java-11-openjdk-devel"
    echo "  Arch: sudo pacman -S jdk-openjdk"
    exit 1
fi
print_status "Java found: $(java -version 2>&1 | head -n 1)"

# Check if Android SDK is installed
if [ -z "$ANDROID_SDK_ROOT" ] && [ -z "$ANDROID_HOME" ]; then
    print_warning "ANDROID_SDK_ROOT or ANDROID_HOME not set"
    
    # Try common locations
    if [ -d "$HOME/Android/Sdk" ]; then
        export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
        print_status "Found Android SDK at: $ANDROID_SDK_ROOT"
    elif [ -d "/opt/android-sdk" ]; then
        export ANDROID_SDK_ROOT="/opt/android-sdk"
        print_status "Found Android SDK at: $ANDROID_SDK_ROOT"
    else
        print_error "Android SDK not found!"
        echo ""
        echo "Install Android SDK:"
        echo "  1. Download Android Studio: https://developer.android.com/studio"
        echo "  2. Or install command-line tools: https://developer.android.com/studio/command-line/sdkmanager"
        echo "  3. Set ANDROID_SDK_ROOT=/path/to/android/sdk"
        exit 1
    fi
fi

if [ -z "$ANDROID_SDK_ROOT" ]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

print_status "Android SDK: $ANDROID_SDK_ROOT"

# Check if sdkmanager exists
if [ ! -f "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ] && [ ! -f "$ANDROID_SDK_ROOT/tools/bin/sdkmanager" ]; then
    print_warning "sdkmanager not found at standard locations"
    print_warning "Make sure you have Android SDK command-line tools installed"
fi

echo ""
echo "Building APK..."
echo "==============="

# Step 1: Install npm dependencies
echo ""
print_status "Step 1/5: Installing npm dependencies..."
npm install

# Step 2: Build the web app
echo ""
print_status "Step 2/5: Building web application..."
npm run build

# Step 3: Add Android platform (if not exists)
echo ""
print_status "Step 3/5: Setting up Capacitor Android..."
if [ ! -d "android" ]; then
    npx cap add android
else
    print_warning "Android platform already exists, skipping..."
fi

# Step 4: Sync Capacitor
echo ""
print_status "Step 4/5: Syncing Capacitor files..."
npx cap sync android

# Step 5: Build APK
echo ""
print_status "Step 5/5: Building APK with Gradle..."

cd android

# Make gradlew executable
chmod +x gradlew

# Build debug APK
echo ""
echo "Building debug APK..."
./gradlew assembleDebug

cd ..

# Check if build was successful
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
    echo ""
    echo "=========================================="
    print_status "APK Build Successful!"
    echo "=========================================="
    echo ""
    echo "📱 APK Location:"
    echo "   $APK_PATH"
    echo ""
    echo "📊 File Size:"
    ls -lh "$APK_PATH" | awk '{print "   " $5}'
    echo ""
    echo "Installation options:"
    echo "  1. USB via ADB:"
    echo "     adb connect <device_ip>:5555"
    echo "     adb install $APK_PATH"
    echo ""
    echo "  2. Manual installation:"
    echo "     - Copy APK to phone"
    echo "     - Open file manager"
    echo "     - Tap the APK to install"
    echo ""
    echo "✨ Ready to deploy!"
else
    echo ""
    print_error "APK build failed!"
    echo "Check the gradle output above for errors."
    exit 1
fi
