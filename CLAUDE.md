# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MuZix is a collaborative music room platform where users create/join rooms, add YouTube songs to a shared queue, and upvote songs to influence playback order. The top-voted song is automatically shown in the embedded YouTube player on the Dashboard.

## Commands

### Client (React + Vite)

```bash
cd client
npm ci               # Clean install (use this, not npm install)
npm run dev          # Dev server at http://localhost:5173
npm run build        # Production build (output → client/dist/)
npm run lint         # ESLint check
```

### Server (Node.js + Express)

```bash
cd server
npm ci               # Clean install
npm run dev          # Start with nodemon auto-reload
npm start            # Start without nodemon (used by Render)
```

No test suites are configured.

## Environment Variables

**Never commit `.env` files.** Copy the `.env.example` in each package and fill in real values.

### `server/.env` — copy from `server/.env.example`

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Random secret for signing JWTs (`openssl rand -hex 32`) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key from Google Cloud Console |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins (no trailing slash) |
| `PORT` | Server port — default 3000; Render overrides this automatically |

### `client/.env.local` — copy from `client/.env.example`

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Backend base URL (`http://localhost:3000` locally; Render URL in prod) |
| `VITE_BASE_PATH` | Vite asset base — `/` locally, `/muzix/` on GitHub Pages |

## Architecture

### Two-package structure

- `client/` — React 18 SPA (Vite, Tailwind CSS, React Router v7 with **HashRouter**, Axios)
- `server/` — Express REST API (Mongoose, bcryptjs, JWT, zod)

**HashRouter is used** so GitHub Pages (static files only) can handle all routes without a server-side fallback.

### Backend (`server/`)

**Entry:** `index.js` → loads `.env`, connects to MongoDB Atlas, mounts all routes at `/api`, exposes `/health`

**Data models** (`db.js`):

- `User` — username, email, password (hashed), createdRooms[], joinedRooms[]
- `Room` — roomName, admin (User ref), users[], songs[], currentSong, songQueue
- `Song` — link, title, thumburl, addedBy (User ref), upvotes, voters[]

**Route structure** (`routes/`):

- `server.js` — mounts `auth.js` at `/auth` and `users.js` at `/user`
- `auth.js` — `POST /signup`, `POST /signin` + exports `authMiddleware`
- `users.js` — room CRUD and song management; all protected by `authMiddleware`
- `yt.js` — YouTube Data API v3 helper (native `fetch`, no extra dep)

**Key API endpoints:**

- `POST /api/auth/signup` / `POST /api/auth/signin` → returns JWT (7-day expiry)
- `POST /api/user/create` — create room (caller becomes admin)
- `POST /api/user/join/:roomId` — join existing room
- `GET /api/user/rooms/:roomId` — room details
- `GET /api/user/rooms/:roomId/songs` — song list sorted by upvotes DESC
- `POST /api/user/rooms/:roomId/songs` — add song from YouTube URL (admin only)
- `POST /api/user/rooms/:roomId/songs/:songId/upvote` — upvote (one per user)
- `GET /api/user/rooms/:roomId/next-song` — highest-voted song

### Frontend (`client/src/`)

**Router** (`App.jsx`, HashRouter): `#/` → `#/signup` → `#/signin` → `#/home` → `#/createroom` | `#/joinroom` → `#/dashboard`

**localStorage keys used across pages:**

- `token` — JWT set on signin
- `userId` — MongoDB ObjectId set on signin
- `username` — display name set on signin
- `roomid` — set when creating or joining a room

**API URL** — every file reads `import.meta.env.VITE_API_URL || 'http://localhost:3000'`.

**Pages:** `Landing`, `Signup`, `Signin`, `Home`, `Dashboard`

**Components:** `Createroom`, `Joinroom`, `SongCard`

**Dashboard behaviour:**

- Fetches room details + song list on mount and after every add/upvote via `fetchData` callback
- `isAdmin` = `roomDetails.admin === localStorage.userId`
- "Add Song" input shown only to the admin
- Top-voted song (index 0) drives the YouTube embed via video ID regex
- Room ID shown in header with one-click copy button for sharing

## Deployment

### Frontend → GitHub Pages (automatic on push)

Every push to `main` triggers `.github/workflows/deploy.yml` which builds the client and deploys `client/dist/` to the `gh-pages` branch.

**One-time setup (do this once):**

1. Repo **Settings → Pages** → Source: `Deploy from a branch` → branch `gh-pages`, folder `/ (root)`
2. Repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_API_URL` = your Render backend URL (e.g. `https://muzix-backend.onrender.com`)

The workflow injects `VITE_BASE_PATH=/<repo-name>/` automatically — no manual update needed when the repo name is `muzix`.

### Backend → Render (connect repo, set env vars in dashboard)

GitHub Pages serves only static files; the Node.js backend must run elsewhere. Render's free tier works.

**One-time setup:**

1. [render.com](https://render.com) → New → Web Service → connect your GitHub repo
2. Render detects `render.yaml` — root dir `server/`, build `npm install`, start `npm start`
3. Render dashboard → your service → **Environment** → add all four secrets:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `YOUTUBE_API_KEY`
   - `ALLOWED_ORIGINS` = `https://<your-github-username>.github.io`

After Render deploys, copy the service URL and add it as the `VITE_API_URL` GitHub secret so the next frontend build points to your live backend.

## Known Limitations

- No WebSocket — page must be refreshed to see other users' additions/upvotes (future: Socket.io)
- Render free tier spins down after inactivity; first request after sleep takes ~30 s
- Only the room admin can add songs; all members can upvote
