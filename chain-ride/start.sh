#!/bin/bash

# Colors
CYAN='\033[0;36m'
NC='\033[0m' # No Color

clear

echo -e "${CYAN}"
echo "  ====================================================="
echo "      CHAINRIDE - Decentralized Ride Sharing App"
echo "  ====================================================="
echo -e "${NC}"
echo "  HOW TO USE ON LOCALHOST:"
echo "  -------------------------"
echo ""
echo "  STEP 1 - Make sure MongoDB is running"
echo "           (Start it via: sudo systemctl start mongod)"
echo ""
echo "  STEP 2 - Install dependencies (First time only)"
echo "           cd backend   then   npm install"
echo "           cd frontend  then   npm install"
echo ""
echo "  STEP 3 - Set up .env files"
echo "           backend/.env   -->  MONGO_URI=mongodb://localhost:27017/chainride"
echo "           frontend/.env  -->  VITE_API_URL=http://localhost:5000/api"
echo ""
echo "  STEP 4 - Run the project (This file does it automatically!)"
echo "           Backend  runs on  http://localhost:5000"
echo "           Frontend runs on  http://localhost:5173"
echo ""
echo "  STEP 5 - Open browser at  http://localhost:5173"
echo "           Register --> Login --> Book or Accept rides"
echo ""
echo -e "${CYAN}  =====================================================${NC}"
echo "      COMMANDS USED IN THIS PROJECT:"
echo -e "${CYAN}  =====================================================${NC}"
echo ""
echo "    node server.js        <-- starts the backend"
echo "    npm run dev           <-- starts the frontend (Vite)"
echo "    npm install           <-- install packages (first time)"
echo ""
echo -e "${CYAN}  =====================================================${NC}"
echo ""
echo "  Starting servers now..."
echo ""

# Resolve script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# -------------------------------------------------------
# Helper: check if node_modules were installed on Windows
# (detects missing Linux native bindings like rolldown)
# -------------------------------------------------------
check_and_fix_modules() {
    local DIR="$1"
    local LABEL="$2"

    if [ ! -d "$DIR/node_modules" ]; then
        echo "      $LABEL: node_modules not found -> running npm install..."
        cd "$DIR" && npm install
        return
    fi

    # Fix bin permissions first (cheap, always safe)
    chmod +x "$DIR/node_modules/.bin/"* 2>/dev/null

    # Check for missing Linux native binding (rolldown / Vite 6+)
    local ROLLDOWN_LINUX="$DIR/node_modules/@rolldown/binding-linux-x64-gnu"
    local ROLLDOWN_BINDING
    ROLLDOWN_BINDING=$(find "$DIR/node_modules/rolldown" -name "*.linux-x64-gnu.node" 2>/dev/null | head -1)

    if [ -d "$DIR/node_modules/rolldown" ] && [ -z "$ROLLDOWN_BINDING" ] && [ ! -d "$ROLLDOWN_LINUX" ]; then
        echo "      $LABEL: Windows node_modules detected (missing Linux native bindings)"
        echo "      $LABEL: Removing node_modules and package-lock.json..."
        rm -rf "$DIR/node_modules" "$DIR/package-lock.json"
        echo "      $LABEL: Running npm install for Linux..."
        cd "$DIR" && npm install
        echo "      $LABEL: Reinstall complete"
    else
        echo "      $LABEL: node_modules OK"
    fi
}

echo "  [0] Checking node_modules compatibility..."
check_and_fix_modules "$BACKEND_DIR"  "Backend"
check_and_fix_modules "$FRONTEND_DIR" "Frontend"
echo ""

# Start Backend in a new terminal
echo "  [1] Starting Backend on port 5000..."
if command -v gnome-terminal &> /dev/null; then
    gnome-terminal --title="ChainRide - Backend (port 5000)" -- bash -c "cd '$BACKEND_DIR' && echo 'Backend running at http://localhost:5000' && node server.js; exec bash"
elif command -v xterm &> /dev/null; then
    xterm -title "ChainRide - Backend (port 5000)" -e "cd '$BACKEND_DIR' && echo 'Backend running at http://localhost:5000' && node server.js; exec bash" &
elif command -v konsole &> /dev/null; then
    konsole --title "ChainRide - Backend (port 5000)" -e bash -c "cd '$BACKEND_DIR' && echo 'Backend running at http://localhost:5000' && node server.js; exec bash" &
else
    # Fallback: run in background and log output
    cd "$BACKEND_DIR" && node server.js > /tmp/chainride-backend.log 2>&1 &
    echo "  (No terminal emulator found — backend running in background. Log: /tmp/chainride-backend.log)"
fi

# Wait for backend to start
sleep 3

# Start Frontend in a new terminal
echo "  [2] Starting Frontend on port 5173..."
if command -v gnome-terminal &> /dev/null; then
    gnome-terminal --title="ChainRide - Frontend (port 5173)" -- bash -c "cd '$FRONTEND_DIR' && echo 'Frontend running at http://localhost:5173' && npm run dev; exec bash"
elif command -v xterm &> /dev/null; then
    xterm -title "ChainRide - Frontend (port 5173)" -e "cd '$FRONTEND_DIR' && echo 'Frontend running at http://localhost:5173' && npm run dev; exec bash" &
elif command -v konsole &> /dev/null; then
    konsole --title "ChainRide - Frontend (port 5173)" -e bash -c "cd '$FRONTEND_DIR' && echo 'Frontend running at http://localhost:5173' && npm run dev; exec bash" &
else
    cd "$FRONTEND_DIR" && npm run dev > /tmp/chainride-frontend.log 2>&1 &
    echo "  (No terminal emulator found — frontend running in background. Log: /tmp/chainride-frontend.log)"
fi

# Wait then open browser
echo "  [3] Opening browser in 5 seconds..."
sleep 5

# Open browser (try common Linux browsers/methods)
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:5173"
elif command -v firefox &> /dev/null; then
    firefox "http://localhost:5173" &
elif command -v google-chrome &> /dev/null; then
    google-chrome "http://localhost:5173" &
fi

echo ""
echo "  Done! Both servers are running."
echo "  Close the two terminal windows to stop the servers."
echo ""
read -p "  Press Enter to exit this window..."