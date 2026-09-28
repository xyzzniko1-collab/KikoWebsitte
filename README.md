# KikoLink — Vercel Fixed

This version is prepared for GitHub → Vercel deployment.

## Important fix
The previous `vercel.json` manually declared a runtime and caused:

> Function Runtimes must have a valid version

The runtime declaration has been removed. Vercel can detect the Node/Express application from `server.js` and `package.json`.

## Database
This project uses Neon Postgres because Vercel Functions should not use local SQLite storage for persistent application data.

Required Vercel Environment Variables:
- `DATABASE_URL`
- `JWT_SECRET`
- `OWNER_USERNAME=KikoEnakTau`
- `OWNER_PASSWORD=AKUNIKO142011`

## Deploy
1. Upload this project to GitHub.
2. Import the repository into Vercel.
3. Add the four environment variables.
4. Deploy.

Do not commit `.env`.

## Login
The UI now has a clearly visible:
- `Login Owner / Member` button in the navbar
- `Login Owner / Member` button in the hero section

The same login modal handles both Owner and Member accounts.

## Local
```bash
npm install
npx vercel dev
```
