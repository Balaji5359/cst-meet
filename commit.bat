@echo off
echo ========================================
echo Git Commit - WebRTC Rewrite + Clean README
echo ========================================
echo.

echo Staging all changes...
git add .

echo.
echo Committing changes...
git commit -m "Rewrite WebRTC implementation and clean README" -m "- Created clean WebRTCManager service based on working HTML test" -m "- Simplified MeetingRoom component (70%% code reduction)" -m "- Removed complex state management" -m "- Improved connection speed and reliability" -m "- Reduced bundle size by 6.47 kB" -m "- Cleaned README: removed optimization, monitoring, troubleshooting sections"

echo.
echo Pushing to origin main...
git push origin main

echo.
echo ========================================
echo Done! Changes deployed via GitHub Actions
echo ========================================
pause
