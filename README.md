# QuickText Backend (Express + Supabase)

## Setup
```bash
cd backend
npm install
cp .env.example .env
# Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role needed for inserts/deletes).
npm run dev
```

## Endpoints
- `POST /api/send` → body: `{ topic, author, message }` → returns `{ id, code, expiresAt }`
- `POST /api/receive` (rate-limited 5/min per IP) → body: `{ code }` → returns message or error
- `GET /api/admin/messages` (header: `x-admin-key`) → list all
- `DELETE /api/admin/messages/:id` (header: `x-admin-key`) → delete

## Database
Run `schema.sql` in Supabase SQL editor to create the `messages` table.