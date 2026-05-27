# 🚗 ChainRide — Decentralized Ride-Sharing Platform

A full-stack ride-sharing app with real-time tracking, Socket.io, and blockchain-ready payments.

---

## ⚡ Quick Start (One Click)

1. Make sure **MongoDB** is running on your computer
2. Double-click **`START.bat`** in the project root folder
3. Browser opens automatically at `http://localhost:5173`

That's it! ✅

---

## 🛠 First-Time Setup

Run these **once** before using the project:

### 1. Install Backend Dependencies
```
cd d:\chain ride updated\backend
npm install
```

### 2. Install Frontend Dependencies
```
cd d:\chain ride updated\frontend
npm install
```

### 3. Make sure MongoDB is running
- Download from: https://www.mongodb.com/try/download/community
- It must run on: `mongodb://localhost:27017`

### 4. Install Blockchain Dependencies
```
cd d:\chain ride updated\blockchain
npm install
```

---

## 🔷 Blockchain (Hardhat Local Node)

### 1. Start the Hardhat Node
```
cd d:\chain ride updated\blockchain
npx hardhat node
```
This starts a local Ethereum node on `http://localhost:8545`.

### 2. Deploy Contracts (in a new terminal)
```
cd d:\chain ride updated\blockchain
npx hardhat ignition deploy ./ignition/modules/Lock.js
```

### 3. Update Backend .env
Add this to `backend/.env`:
```
BLOCKCHAIN_RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=<deployed-contract-address>
```

---

## 🔧 Environment Variables

### Backend — `backend/.env`
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/chainride
```

### Frontend — `frontend/.env`
```
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key_here
```

---

## 🚀 Manual Start (Without the batch file)

Open **two terminals** and run:

**Terminal 1 — Backend:**
```
cd d:\chain ride updated\backend
node server.js
```

**Terminal 2 — Frontend:**
```
cd d:\chain ride updated\frontend
npm run dev
```

Then open: `http://localhost:5173`

---

## 📱 How to Use

| Step | Action |
|------|--------|
| 1 | Go to `http://localhost:5173` |
| 2 | Click **Get Started** → Register an account |
| 3 | As **Passenger**: Book a ride from the dashboard |
| 4 | As **Driver**: Switch to Driver mode → Accept rides |
| 5 | Track your ride live on the map |
| 6 | Pay after completion via UPI / Cash / Crypto |

---

## 📁 Project Structure

```
chain ride updated/
│
├── START.bat              ← Double-click to run everything
│
├── backend/               ← Node.js + Express + MongoDB
│   ├── server.js          ← Entry point
│   ├── controllers/       ← Business logic
│   ├── models/            ← MongoDB schemas
│   ├── routes/            ← API endpoints
│   ├── middleware/        ← Auth middleware
│   ├── services/          ← Pricing calculator
│   └── sockets/           ← Socket.io real-time events
│
└── frontend/              ← React + Vite
    └── src/
        ├── pages/         ← Auth, Dashboard, RideSearch, LiveTracking, Profile, Wallet
        ├── components/    ← PaymentModal, CountUp, Animations
        ├── context/       ← Web3Context (MetaMask)
        └── utils/
            └── api.js     ← Centralized API helper (auto-attaches userId)
```

---

## 🌐 API Endpoints

### Auth
| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login |

### Rides
| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/rides/instant` | Request a ride (passenger) |
| GET | `/api/rides/my-rides` | Passenger's ride history |
| GET | `/api/rides/available` | Available rides for drivers |
| GET | `/api/rides/driver-rides` | Driver's accepted rides |
| PATCH | `/api/rides/:id/accept` | Driver accepts ride |
| PATCH | `/api/rides/:id/status` | Update ride status |
| GET | `/api/rides/:id` | Get single ride |

### Profile
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/profile` | Get full profile + stats |
| PUT | `/api/profile` | Update profile info |
| POST | `/api/profile/upload-avatar` | Upload profile photo |
| POST | `/api/profile/upload-qr` | Upload payment QR code |

> All protected routes require `X-User-Id` header (handled automatically by `frontend/src/utils/api.js`)

---

## 🔄 Auth System

**No JWT tokens.** The system uses a simple `userId`:
- Login/Register → stores `userId` in `localStorage`
- Every API call → sends `X-User-Id: <userId>` header automatically
- Backend reads the header and identifies the user

---

## 🛑 Troubleshooting

| Problem | Fix |
|---------|-----|
| White screen after login | Open browser console (F12) for errors |
| "Access denied" on API | Check `localStorage.getItem('userId')` is set |
| "Invalid token" error | Clear localStorage, login again |
| MongoDB connect error | Start MongoDB service first |
| Port already in use | Kill process on port 5000 / 5173 |
| Duplicate email error | Drop the `email_1` index in MongoDB |
