# KikoLink — Vercel Ready

## Stack
- Express 5
- Vercel Node.js Function
- Neon Postgres (`@neondatabase/serverless`)
- JWT in HTTP-only cookie
- bcrypt password hashing
- Static frontend in `public/`

## Why not SQLite?
Vercel Functions do not provide durable/shared local filesystem storage. The app therefore uses Postgres for users and links.

## Deploy from GitHub
1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Create/connect a Neon Postgres database through Vercel Marketplace or use an existing Neon database.
4. Add these Environment Variables in Vercel:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `OWNER_USERNAME`
   - `OWNER_PASSWORD`
5. Deploy.

The database tables are created automatically on the first API request.

## Local development
```bash
npm install
npx vercel dev
```

## Important
Do not commit `.env`.
The first Owner is created automatically from `OWNER_USERNAME` / `OWNER_PASSWORD`. The supplied starter defaults are `KikoEnakTau` / `AKUNIKO142011`; change them before production if this repository will be public.
Change/rotate these credentials before production use.

Follow/Subscribe gates in this version are action gates. Real verification of a Discord/YouTube/etc. follow or subscription requires the platform's official OAuth/API integration.
