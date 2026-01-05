# Contravention Tracker

A full-stack web application for tracking procurement contraventions, managing employee points, and enforcing escalation policies.

## Tech Stack

### Backend
- **Runtime**: Node.js + Express
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Auth**: JWT

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **State**: React Query + Zustand
- **Charts**: Recharts

## Features

- **Contravention Management**: Log, track, and manage procurement contraventions
- **Points System**: Automatic point calculation based on severity
- **Escalation Engine**: 5-level escalation (Verbal Warning → Severe Consequences)
- **Training Trigger**: Mandatory course assigned at 5 points
- **Dispute Process**: 5-day dispute window with panel review
- **Reports & Analytics**: Dashboard, department breakdown, export to Excel

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account (for PostgreSQL database)

### 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Get your database connection strings from Project Settings → Database

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your Supabase credentials
# DATABASE_URL="postgresql://..."
# DIRECT_URL="postgresql://..."

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed initial data (departments, types, admin user)
npm run db:seed

# (Optional) Import existing contraventions from Excel
# First copy your Excel file to the backend folder
cp ../Contraventions🔥.xlsx .
npx ts-node prisma/migrate-excel.ts

# Start development server
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

### 4. Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Default Admin Login

- Email: `admin@ogp.gov.sg`
- Password: `admin123`

## Project Structure

```
contravention-tracker-app/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   ├── seed.ts            # Seed data script
│   │   └── migrate-excel.ts   # Excel import script
│   └── src/
│       ├── config/            # Configuration files
│       ├── middleware/        # Express middleware
│       ├── routes/            # API routes
│       ├── services/          # Business logic
│       ├── validators/        # Zod schemas
│       └── types/             # TypeScript types
│
└── frontend/
    └── src/
        ├── api/               # API client functions
        ├── components/        # React components
        ├── hooks/             # Custom hooks
        ├── pages/             # Page components
        ├── stores/            # Zustand stores
        ├── types/             # TypeScript types
        └── lib/               # Utility functions
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Contraventions
- `GET /api/contraventions` - List all (with filters)
- `POST /api/contraventions` - Create new (admin)
- `GET /api/contraventions/:id` - Get single
- `PATCH /api/contraventions/:id` - Update (admin)
- `POST /api/contraventions/:id/acknowledge` - Acknowledge
- `POST /api/contraventions/:id/dispute` - Submit dispute

### Employees
- `GET /api/employees` - List all
- `GET /api/employees/:id` - Get profile
- `GET /api/employees/:id/points` - Get points summary
- `GET /api/employees/:id/contraventions` - Get contraventions

### Reports
- `GET /api/reports/dashboard` - Dashboard stats
- `GET /api/reports/by-department` - Department breakdown
- `GET /api/reports/repeat-offenders` - Repeat offenders
- `GET /api/reports/export` - Export to Excel

## Escalation Levels

| Level | Points | Name | Consequences |
|-------|--------|------|--------------|
| 1 | 1-2 | Verbal Reminder | Supervisor notified |
| 2 | 3-4 | Written Warning | Formal warning + HR file |
| 3 | 5-7 | Mandatory Training | Course required within 30 days |
| 4 | 8-11 | Performance Impact | PIP + reduced approval limits |
| 5 | 12+ | Severe Consequences | Privileges suspended |

## Deployment

### Backend (Render / Railway)
1. Connect your repository
2. Set environment variables
3. Build command: `npm run build`
4. Start command: `npm start`

### Frontend (Vercel)
1. Connect your repository
2. Set `VITE_API_URL` environment variable
3. Build command: `npm run build`
4. Output directory: `dist`

## License

MIT
