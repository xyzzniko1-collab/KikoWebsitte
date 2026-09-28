# KikoLink

## Vercel deploy
1. Import this folder/repository into Vercel.
2. Set Environment Variables for Production (and Preview if you test there):
   - DATABASE_URL = Neon Postgres connection string
   - JWT_SECRET = long random secret
   - OWNER_USERNAME = KikoEnakTau
   - OWNER_PASSWORD = AKUNIKO142011
3. Redeploy after saving variables.
4. Open `/api/health`. It should return `ok: true` and show `owner: "KikoEnakTau"`.
5. Then login with the owner credentials.

Do not commit real `.env` files or secrets to GitHub.
