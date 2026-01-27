# Contravention Tracker

A full-stack web application for tracking procurement contraventions, managing employee points, and enforcing escalation policies. Built as part of OGP's Hack for Public Good.

## Tech Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **State**: React Query + Zustand
- **Charts**: Recharts

### Backend
- **Runtime**: Node.js + Express
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Auth**: JWT + Email OTP

### Deployment
- **Hosting**: Vercel (Frontend + API)
- **Database**: Supabase

## Features

- **Contravention Management**: Log, track, and manage procurement contraventions
- **Points System**: Automatic point calculation based on contravention severity
- **Escalation Engine**: 5-level escalation system with automated notifications
- **Approval Workflow**: Multi-level approval process with email notifications
- **Training Integration**: Mandatory training triggered at point thresholds
- **Reports & Analytics**: Dashboard with charts, department breakdowns, and Excel export
- **Email Notifications**: Automated alerts via Google Apps Script

## Project Structure

```
contravention-tracker-app/
├── frontend/              # React frontend application
│   └── src/
│       ├── api/          # API client functions
│       ├── components/   # Reusable UI components
│       ├── pages/        # Page components
│       ├── stores/       # Zustand state stores
│       └── lib/          # Utility functions
│
├── server/               # Express backend (Vercel deployment)
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic
│   ├── middleware/       # Auth, validation, error handling
│   └── validators/       # Zod schemas
│
├── backend/              # Backend for local development
│   ├── src/              # Source code
│   └── prisma/           # Database schema and seeds
│
├── prisma/               # Prisma schema (Vercel)
├── api/                  # Vercel serverless entry point
└── gas-email/            # Google Apps Script for emails
```

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account (for PostgreSQL database)

### Local Development

1. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your Supabase credentials
   npm run db:generate
   npm run db:push
   npm run db:seed
   npm run dev
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Access the Application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

### Demo Accounts

The application includes demo accounts for testing different user roles.

## Escalation Levels

| Level | Points | Name | Consequences |
|-------|--------|------|--------------|
| 1 | 1-2 | Verbal Reminder | Supervisor notified |
| 2 | 3-4 | Written Warning | Formal warning + HR file |
| 3 | 5-7 | Mandatory Training | Course required within 30 days |
| 4 | 8-11 | Performance Impact | PIP + reduced approval limits |
| 5 | 12+ | Severe Consequences | Privileges suspended |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Email OTP login
- `POST /api/auth/demo-login` - Demo account login
- `GET /api/auth/me` - Get current user

### Contraventions
- `GET /api/contraventions` - List with filters
- `POST /api/contraventions` - Create new
- `GET /api/contraventions/:id` - Get details
- `PATCH /api/contraventions/:id` - Update

### Employees
- `GET /api/employees` - List all
- `GET /api/employees/:id` - Get profile with points

### Reports
- `GET /api/reports/dashboard` - Dashboard statistics
- `GET /api/reports/export` - Export to Excel

## License

MIT
