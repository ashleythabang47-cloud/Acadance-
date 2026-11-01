# Acadance

Acadance is a full-stack academic platform for student performance tracking,
study streaks, AI-generated quizzes, collaborative voice study rooms, and
administration. The application is maintained in [`saics/`](./saics/); see the
[application README](./saics/README.md) for the full feature list, API reference,
database setup, and testing instructions.

## Run locally

Requirements: Node.js LTS and MySQL.

1. Create the database by running `saics/backend/database/schema.sql` in MySQL.
   To populate example subjects, run `saics/backend/database/seed.sql`.
2. In `saics/backend`, copy `.env.example` to `.env`, configure the database
   credentials and a strong `JWT_SECRET`, then install dependencies and start
   the API:

   ```powershell
   cd saics/backend
   Copy-Item .env.example .env
   npm install
   npm run seed:admin
   npm run dev
   ```

   Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before running the admin
   seed command. The API listens on `http://localhost:5000`; its health endpoint
   is `http://localhost:5000/api/health`.
3. In a separate terminal, install and start the frontend:

   ```powershell
   cd saics/frontend
   npm install
   npm run dev
   ```

   Open the Vite URL printed in the terminal (normally
   `http://localhost:5173`).

The backend requires MySQL to be running. Configure at least one AI provider
(Groq, Gemini, or a local Ollama instance) to generate and grade quizzes.
