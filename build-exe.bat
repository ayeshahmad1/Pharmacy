@echo off
echo ========================================
echo Building PharmacyPOS.exe
echo ========================================
echo.

echo Step 1: Building frontend...
cd pharmacy-frontend1
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)
echo Frontend build completed!
echo.

echo Step 2: Copying frontend build to backend...
cd ..
if not exist "pharmacy-backend\public" mkdir "pharmacy-backend\public"
xcopy /E /I /Y /Q "pharmacy-frontend1\dist\*" "pharmacy-backend\public\"
echo Frontend files copied!
echo.

echo Step 3: Building executable...
cd pharmacy-backend
call npm run build:exe
if errorlevel 1 (
    echo ERROR: Executable build failed!
    pause
    exit /b 1
)
echo.

echo ========================================
echo Build completed successfully!
echo ========================================
echo.
echo PharmacyPOS.exe is located in: pharmacy-backend\PharmacyPOS.exe
echo.
echo IMPORTANT: Make sure to include the .env file with your distribution!
echo.
pause

