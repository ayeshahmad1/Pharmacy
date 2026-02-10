#!/bin/bash

echo "========================================"
echo "Building PharmacyPOS.exe"
echo "========================================"
echo ""

echo "Step 1: Building frontend..."
cd pharmacy-frontend1
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed!"
    exit 1
fi
echo "Frontend build completed!"
echo ""

echo "Step 2: Copying frontend build to backend..."
cd ..
mkdir -p pharmacy-backend/public
cp -r pharmacy-frontend1/dist/* pharmacy-backend/public/
echo "Frontend files copied!"
echo ""

echo "Step 3: Building executable..."
cd pharmacy-backend
npm run build:exe
if [ $? -ne 0 ]; then
    echo "ERROR: Executable build failed!"
    exit 1
fi
echo ""

echo "========================================"
echo "Build completed successfully!"
echo "========================================"
echo ""
echo "PharmacyPOS.exe is located in: pharmacy-backend/PharmacyPOS.exe"
echo ""
echo "IMPORTANT: Make sure to include the .env file with your distribution!"
echo ""

