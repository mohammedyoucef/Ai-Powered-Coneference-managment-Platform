# Confexa

Confexa is a modern conference management platform for creating events, managing submissions, assigning reviewers, and publishing event websites.

## Features

- **Conference Management**: Create and manage organizations and conferences
- **Submission System**: Researchers can submit papers with file uploads
- **Review Workflow**: Double-blind/single-blind reviews, assignments, and decisions
- **Event Websites**: AI-generated or custom landing pages with working CTAs and timers
- **User Roles**: Organizer, Researcher, Reviewer, Visitor with role-based access

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [PostgreSQL](https://www.postgresql.org/) (via Supabase/pg)
- [Zod](https://zod.dev/)

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL database

### Installation

1. Clone the repository
```bash
git clone https://github.com/mohammedyoucef/Ai-Powered-Coneference-managment-Platform.git
cd Ai-Powered-Coneference-managment-Platform
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
Create a `.env.local` file:
```env
DATABASE_URL=postgresql://user:password@host:port/database
DATABASE_SSL=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Run migrations
```bash
npm run db:migrate
```

5. Start development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Demo

Use the seed endpoint to create demo data, or create accounts manually. The platform supports role-based workflows for organizers, researchers, and reviewers.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run typecheck` - Run TypeScript checks
- `npm run db:migrate` - Run database migrations
