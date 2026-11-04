# Hymn web app

The web app manages the shared Turso song library and schedules. The desktop
presenter downloads a read-only snapshot through this API and keeps a local
SQLite cache for offline presentation.

## Required environment variables

Copy `.env.example` for local development and configure the same server-only
variables in Vercel:

- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`: used only by the server API.
- `JWT_SECRET`: a random value of at least 32 characters.
- `DESKTOP_SYNC_TOKEN`: optional legacy credential for already provisioned
  installations. New desktop installations sign in with a Hymn account and do
  not require this variable.
- `ALLOW_PUBLIC_REGISTRATION`: defaults to disabled; set to `true` only when
  intentionally accepting new member accounts.

Never expose these values through a `VITE_` variable. Vite variables are sent
to the browser.

## Roles

- `member`: read songs and schedules.
- `editor`: member access plus create, edit, and delete songs and schedules.
- `admin`: editor access plus user-role administration.

Public registration, when enabled, creates `member` accounts. An existing
administrator can list users with `GET /api/users` and update a role with
`PATCH /api/users/:id/role` using `{ "role": "editor" }` or
`{ "role": "admin" }`. Role changes and account deactivation are enforced on
the user's next protected request.

For the first deployment, promote the initial administrator directly in Turso:

```sql
UPDATE users SET role = 'admin' WHERE username = 'your-username';
```

Then leave public registration disabled.

## Desktop connection

The desktop is preconfigured for `https://top-hymn.vercel.app`. Users sign in
once with an active Hymn account. The API returns a 30-day token restricted to
desktop synchronization; the password is never stored by the desktop.

The optional legacy desktop token only reaches the snapshot endpoint. It is not
a Turso token, cannot submit SQL, and cannot change cloud records.

## Sync contract

The canonical desktop contract is `sync-contract-v1.schema.json` and the
versioned endpoint is `GET /api/sync/v1/snapshot`.

- Turso is authoritative for records carrying cloud IDs.
- Desktop-only records are never included, overwritten, or uploaded.
- Every ID crosses the API as a string.
- The desktop rejects unknown contract versions, duplicate IDs, and schedule
  items that refer to missing songs or schedules.
- `ETag`/`If-None-Match` avoids rewriting the local cache when cloud content has
  not changed.
- Breaking field or behavior changes require a new `/api/sync/vN` endpoint and
  schema; v1 must not be changed incompatibly.

## Development

```sh
npm install
npm run dev
npm run build
```
