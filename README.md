# Hymn
### Song preparation on the web. Presentation beyond the browser.

A worship workflow for managing a shared song library and scheduled setlists.
The web app connects to a desktop presenter through a versioned sync API, so
prepared content can be cached locally for offline presentation.

**[Open web app](https://top-hymn.vercel.app)** · [Developer setup](#required-environment-variables) · [Sync contract](#sync-contract)

> The hosted app requires an authorized Hymn account.

## At a glance

| Capability | What it does |
| --- | --- |
| Song library and setlists | Keep lyrics and service schedules in one shared workspace. |
| Photo-to-lyrics import | Run OCR in the browser, remove chord-only rows, and review lyrics before saving. |
| Role-based access | Separate member, editor, and administrator permissions. |
| Desktop synchronization | Deliver read-only snapshots with a versioned schema and conditional requests. |
| Offline presentation support | Let the desktop presenter keep a local SQLite cache without uploading desktop-only records. |

**Stack:** Vue 3 · Vite · Tailwind CSS · Node.js / Express · Turso · Tesseract.js

This repository contains the **web app and sync API**. The desktop presenter is
a separate client.

---

## Developer documentation

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

## Photo-to-lyrics import

Editors and administrators can scan an image from the song editor. OCR runs in
the browser using bundled language data, removes chord-only rows and bracketed
inline chords, then places the result in the normal lyrics field for review.
Nothing is written to Turso until the user presses **Save Song**.

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
npm test
npm run build
```
