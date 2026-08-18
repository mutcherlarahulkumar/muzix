# MuZix

A shared room you and your friends study in. One YouTube queue everyone votes
on, a synchronised player so you're all at the same second of the same song, a
pomodoro timer the whole room runs together, and a leaderboard that gives you XP
for finishing sessions.

It started as a collaborative music queue. The study-room half grew out of
actually using it.

## What's in a room

- **Shared queue** — paste a YouTube link, everyone sees it appear. Songs are
  ordered by upvotes, ties broken by whoever added theirs first.
- **Synchronised playback** — play, pause and seek propagate to everyone. A
  finished song is removed from the queue for the whole room at once.
- **Pomodoro** — 25/5 by default, any member can start, pause or skip it, and the
  server holds the authoritative clock so a late joiner lands mid-session with
  the right time remaining. Completing a work block awards XP to everyone present.
- **Tasks** — a shared checklist. You can only tick off or delete your own items.
- **Chat and reactions** — 80 messages of backlog on join, plus emoji reactions
  that fly across everyone's screen.
- **Voice** — WebRTC peer connections, signalled over the same socket.
- **Leaderboard** — XP, weekly XP and completed sessions, per room and global.

Rooms with no activity for 24 hours are cleaned up nightly, along with their songs.

## Why the ordering lives in one file

`server/queue.js` exports both `orderQueue()` (used in JavaScript) and
`QUEUE_SORT` (handed to MongoDB). They used to be separate sorts in two routes,
and neither defined a tiebreak — so with two songs on equal votes the room list
could show one at the top while the player started the other. Same rule, one
place, and a test that fails if the two drift apart.

## Running it

```bash
cd server
cp .env.example .env      # MONGODB_URI, JWT_SECRET, YOUTUBE_API_KEY, ALLOWED_ORIGINS
npm ci && npm run dev

cd ../client
cp .env.example .env
npm ci && npm run dev     # http://localhost:5173
```

Or the server in a container:

```bash
docker build -t muzix-server ./server
docker run --rm -p 3000:3000 --env-file server/.env muzix-server
```

## Deployment

Three targets, because they do different jobs:

| Target | What runs there | Config |
| --- | --- | --- |
| GitHub Pages | The React client | `.github/workflows/deploy.yml` |
| Azure App Service | The server container | `.github/workflows/backend.yml` |
| Kubernetes | The server container | `k8s/` |
| Render | The server, without a container | `render.yaml` |

`.github/workflows/backend.yml` runs the tests, builds the server image, pushes
it to GHCR tagged with both `latest` and the commit SHA, then deploys that exact
SHA to Azure App Service — so what you deploy is the image CI tested, not a
`latest` that moved underneath you.

For Kubernetes:

```bash
kubectl create secret generic muzix-secrets --from-env-file=server/.env
kubectl apply -f k8s/
```

Two details in there worth knowing about:

- **The Service uses `sessionAffinity: ClientIP`.** Socket.IO opens on HTTP
  long-polling and upgrades to WebSocket, and both halves of that handshake have
  to reach the same pod.
- **`replicas: 1`, on purpose.** Room membership, playback position, the pomodoro
  clock and the chat backlog all live in `Map`s inside `server/socket.js`. A
  second pod would serve a different half of every room. Scaling out means moving
  that state into Redis behind `@socket.io/redis-adapter` first — the replica
  count is not what's standing in the way.

## Tests

```bash
cd server && npm test
```

They cover the queue ordering: highest votes first, ties by insertion order,
stability across repeated calls, songs with no votes sorting last rather than
first, no mutation of the caller's array, and the Mongo sort spec agreeing with
the JavaScript one.

## Known rough edges

- **Single-replica only**, as above — the honest ceiling of keeping room state in
  memory.
- **Room state is lost on restart.** Chat backlog, tasks and the pomodoro clock
  are in-process; songs and rooms are in MongoDB and survive.
- **No rate limiting** on the API.
- **XP is awarded to everyone in the room** when a work block completes, whether
  or not they were actually there for it.

## Layout

```
server/
  index.js         Express + Socket.IO bootstrap, CORS, nightly room cleanup
  socket.js        every realtime event: playback, chat, pomodoro, tasks, WebRTC
  queue.js         the one definition of play order
  db.js            Mongoose schemas
  routes/          auth, rooms and songs, YouTube metadata lookup
  Dockerfile       non-root production image
client/            React + Vite + Tailwind
k8s/               Deployment, Service, and a secret template
```
