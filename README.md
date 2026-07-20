# SAICS — Student Academic Insights & Collaborative System

Phase 1 deliverable: **database schema + backend API + frontend interface** for
authentication and a dashboard shell. Later phases (quizzes, predictions,
voice study sessions, streaks) will build on top of this foundation.

## Stack
- **Frontend:** React + TypeScript (Vite), React Router, Axios
- **Backend:** Node.js + Express + TypeScript
- **Database:** MySQL
- **Auth:** JWT + bcrypt password hashing

## Folder structure
```
saics/
├── backend/
│   ├── database/schema.sql       ← run this first to create the DB
│   ├── src/
│   │   ├── config/db.ts          ← MySQL connection pool
│   │   ├── models/               ← DB queries per entity
│   │   ├── controllers/          ← request handlers
│   │   ├── middleware/           ← JWT auth guard
│   │   ├── routes/               ← /api/auth, /api/students
│   │   └── server.ts             ← Express entry point
│   └── .env.example              ← copy to .env and fill in your MySQL creds
└── frontend/
    └── src/
        ├── api/client.ts         ← axios instance (auto-attaches JWT)
        ├── context/AuthContext.tsx
        ├── components/ProtectedRoute.tsx
        └── pages/Login.tsx, Register.tsx, Dashboard.tsx
```

## Getting it running locally

### 1. Database
```bash
mysql -u root -p < backend/database/schema.sql
```

### 2. Backend
```bash
cd backend
cp .env.example .env      # then edit .env with your MySQL password + a JWT secret
npm install
npm run dev                # runs on http://localhost:5000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                # runs on http://localhost:5173
```

Open http://localhost:5173, register an account, and you'll land on the
dashboard — which now proves the full stack talks end-to-end: React → Express
→ MySQL.

## What Phase 1 actually gives you
- Full MySQL schema for every entity from your proposal (students, subjects,
  performance records, quizzes + questions + attempts, study sessions, streaks,
  predictions, notifications) — ready for Phase 2 to build features against.
- Working registration/login with hashed passwords and JWT sessions.
- A protected dashboard route (can't access `/dashboard` without logging in).
- Card placeholders on the dashboard mapped to your remaining modules, so your
  supervisor/demo can literally see the roadmap.

## Suggested next phase (Phase 2)
- Academic Tracking Module: CRUD for performance records + a real dashboard
  chart (recharts pairs well with your stack).
- AI Prediction Module: a small Python/scikit-learn service (or a Node-side
  rules-based stand-in first, since your timeline has Analysis Phase before
  Implementation).
