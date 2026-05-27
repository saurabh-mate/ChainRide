@echo off
color 0B
cls

echo.
echo  =====================================================
echo      CHAINRIDE - Decentralized Ride Sharing App
echo  =====================================================
echo.
echo  HOW TO USE ON LOCALHOST:
echo  -------------------------
echo.
echo  STEP 1 - Make sure MongoDB is running
echo           (Start it from Windows Services or Compass)
echo.
echo  STEP 2 - Install dependencies (First time only)
echo           cd backend   then   npm install
echo           cd frontend  then   npm install
echo.
echo  STEP 3 - Set up .env files
echo           backend\.env   --^>  MONGO_URI=mongodb://localhost:27017/chainride
echo           frontend\.env  --^>  VITE_API_URL=http://localhost:5000/api
echo.
echo  STEP 4 - Run the project (This file does it automatically!)
echo           Backend  runs on  http://localhost:5000
echo           Frontend runs on  http://localhost:5173
echo.
echo  STEP 5 - Open browser at  http://localhost:5173
echo           Register --^> Login --^> Book or Accept rides
echo.
echo  =====================================================
echo      COMMANDS USED IN THIS PROJECT:
echo  =====================================================
echo.
echo    node server.js        ^<-- starts the backend
echo    npm run dev           ^<-- starts the frontend (Vite)
echo    npm install           ^<-- install packages (first time)
echo.
echo  =====================================================
echo.
echo  Starting servers now...
echo.

:: Start Backend
echo  [1] Starting Backend on port 5000...
start "ChainRide - Backend (port 5000)" cmd /k "cd /d d:\chain ride updated\backend && echo Backend running at http://localhost:5000 && node server.js"

:: Wait for backend
timeout /t 3 /nobreak > nul

:: Start Frontend
echo  [2] Starting Frontend on port 5173...
start "ChainRide - Frontend (port 5173)" cmd /k "cd /d d:\chain ride updated\frontend && echo Frontend running at http://localhost:5173 && npm run dev"

:: Wait then open browser
echo  [3] Opening browser in 5 seconds...
timeout /t 5 /nobreak > nul
start "" "http://localhost:5173"

echo.
echo  Done! Both servers are running.
echo  Close the two terminal windows to stop the servers.
echo.
pause
