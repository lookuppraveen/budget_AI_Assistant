# Budget AI Assistant Backend (Step 1)

Node.js API using Express + PostgreSQL with secure auth and role-based access.

## Architecture

- `src/config`: env and database bootstrap
- `src/modules`: feature modules (`auth`, `users`, `health`)
- `src/middleware`: auth, RBAC, validation, and centralized error handling
- `sql/migrations`: SQL migrations
- `scripts`: migration and seed runners

## Quick Start

1. Copy env file:
   - `copy .env.example .env`
2. Update DB/JWT values in `.env`
3. Install dependencies:
   - `npm install`
4. Run migrations:
   - `npm run migrate`
5. Seed initial data:
   - `npm run seed`
6. Start API:
   - `npm run dev`

## Seed Login

- Email: `admin@stlcc.edu`
- Password: `Admin@12345`
- Role: `Admin`

## API Base

- `http://localhost:4000/api/v1`

## Step 2 Endpoints

- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `GET /auth/me`
- `GET /users` (Admin, Budget Analyst)
- `GET /admin/users` (Admin)
- `PATCH /admin/users/:id` (Admin)
- `GET /roles` (Authenticated)
- `GET /departments` (Authenticated)
- `POST /departments` (Admin)
- `GET /documents` (Authenticated, optional `departmentCode`, `status`)
- `POST /documents` (Admin, Budget Analyst, Department Editor)
- `PATCH /documents/:id/status` (Admin, Budget Analyst)
- `GET /analytics/dashboard` (Authenticated)
- `GET /reports` (Authenticated)
- `GET /reports/summary` (Authenticated)
