# Confexa

AI-powered academic conference management platform (in progress). This repository currently contains the initialized project shell only.

## Tech Stack

- [Next.js](https://nextjs.org/) 16 (App Router)
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/) (strict)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [shadcn/ui](https://ui.shadcn.com/) (neutral, CSS variables)
- [Supabase](https://supabase.com/) (prepared, not yet integrated)
- [ESLint](https://eslint.org/)

## Getting Started

### Prerequisites

- Node.js 18.18+ or 20+ (recommended)
- npm

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in values as needed:

```bash
cp .env.example .env.local
```

The app does not require API keys to run in its current state.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
```

### Start Production Server

```bash
npm run start
```

### Linting

```bash
npm run lint
```

## Project Structure

```
src/
├── app/              # App Router routes and layouts
├── components/       # UI components (including shadcn/ui)
│   └── layout/       # App shell (header/nav/footer)
└── lib/              # Utilities
```

Routes included (placeholders):
- `/` - Landing page
- `/dashboard` - Dashboard
- `/conferences` - Conferences list
- `/conferences/new` - Conference creation
- `/submissions` - Paper submissions
- `/review` - AI review
- `/settings` - Settings

## Notes

- Authentication and database operations are not implemented.
- No secrets are hardcoded. Use `.env.local` for local configuration.
- This is initialization only; future work will add features incrementally.
- Do not commit `.env.local` or other secret-bearing files.

## Deployment

Deploy to any platform that supports Next.js (e.g., Vercel). Set environment variables via your platform's configuration.
