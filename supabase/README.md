# Supabase Setup

## 1) Apply migrations

Apply `supabase/migrations/20251028090000_init_schema.sql` to your Supabase project using one of:
- Supabase Dashboard → SQL Editor (paste and run)
- Supabase CLI: `supabase db push` (if linked)

## 2) Environment variables

Set in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (server-only, never exposed to client)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 3) Auth settings (Dashboard)

In Authentication → Providers:
- Email/Password: enable as needed
- Email confirmation: if enabled, users must confirm email before full access; the app will show appropriate messaging

In Authentication → URL Configuration:
- Site URL: `http://localhost:3000` (dev) or your deployed URL
- Redirect URLs: add `http://localhost:3000/auth/callback` and your deployed callback

## 4) Notes on security

- RLS is enabled on all user/org data tables
- Policies are least-privilege; recursive designs avoided via `security definer` helper functions with fixed `search_path`
- Profile creation is handled by `on_auth_user_created` trigger (cannot be arbitrarily set by client)
- Organization membership creation is controlled by app logic + policies (users cannot grant themselves roles arbitrarily)
- Public access only allows `status='published'` and `visibility='public'` conferences
- Unlisted/private conferences not exposed publicly
- Service role key must never be used in client components
- One-conference-per-organization enforced in application logic (schema remains extensible)
