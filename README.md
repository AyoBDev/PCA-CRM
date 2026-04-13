# NV Best PCA

**All-in-one operations system for Personal Care Attendant (PCA) agencies in the US.**

Manage clients, authorizations, timesheets, digital signatures, employee scheduling, and payroll processing — all from a single platform.

**Live:** [pca-crm-production.up.railway.app](https://pca-crm-production.up.railway.app/)

---

## Screenshots

| Dashboard | Clients |
|-----------|---------|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Clients](docs/screenshots/clients.png) |

## Features

- **Client Management** — track clients with Medicaid IDs, insurance types, and service authorizations
- **Authorization Tracking** — monitor authorization status, expiration dates, and renewal reminders
- **Timesheets** — weekly timesheet creation with ADL/IADL/Respite activity logging and time tracking
- **Digital Signatures** — shareable signing links for PCA and client signatures with one-time-use tokens
- **Employee Scheduling** — weekly schedule matrix with shift management, overlap detection, and authorization-aware hour tracking
- **Payroll Processing** — XLSX import pipeline with EVV data merge, time rules, unit calculation, daily/auth caps, and inline review
- **Role-Based Access** — admin and PCA roles with JWT authentication
- **Bulk Import** — import client data from spreadsheets

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, React Router |
| Backend | Express.js, Node.js |
| Database | SQLite via Prisma ORM |
| Auth | JWT with role-based access control |
| Styling | Custom CSS (shadcn/ui zinc design tokens) |
| Deployment | Railway |

## Getting Started

### Prerequisites

- **Node.js** v18+
- **npm** v9+

### Installation

```bash
# Clone the repository
git clone https://github.com/AyoBDev/PCA-CRM.git
cd PCA-CRM

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Environment Setup

Create a `.env` file in the `server/` directory:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-key"
PORT=4000
```

### Database Setup

```bash
cd server

# Run migrations
npx prisma migrate dev

# Seed the admin user
npm run db:seed
```

This creates a default admin account:
- **Email:** admin@nvbestpca.com
- **Password:** admin123

### Running the App

Start both the server and client in separate terminals:

```bash
# Terminal 1 — API server (port 4000)
cd server
npm run dev

# Terminal 2 — Vite dev server (port 5173)
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
# Build the client
cd client
npm run build

# Start the server (serves client/dist as static files)
cd ../server
npm start
```

The app is available at [http://localhost:4000](http://localhost:4000).

## Project Structure

```
nvbestpca/
├── client/                 # React frontend
│   └── src/
│       ├── App.jsx         # Root component, routing, auth
│       ├── api.js          # API client helpers
│       ├── index.css       # Global styles
│       ├── pages/          # Page components
│       └── components/     # Shared components
├── server/                 # Express backend
│   └── src/
│       ├── app.js          # Express setup, middleware, routes
│       ├── index.js        # Entry point
│       ├── routes/         # Route definitions
│       ├── controllers/    # Request handlers
│       ├── services/       # Business logic
│       ├── middleware/      # Auth middleware
│       └── lib/            # Prisma client
│   └── prisma/
│       ├── schema.prisma   # Database schema
│       ├── seed.js         # Admin seeder
│       └── migrations/     # SQL migrations
└── README.md
```

## Testing

```bash
# Server tests
cd server
npm test

# Run a specific test file
npx jest --testPathPattern=authorizationService

# Client tests
cd client
npm run test
```

## Deployment

The app is deployed on **Railway** as a single service:

1. Express serves the React build from `client/dist`
2. Start command: `prisma migrate deploy` -> `seed.js` -> `node src/index.js`
3. Required environment variables: `DATABASE_URL`, `JWT_SECRET`, `PORT`

## License

MIT
