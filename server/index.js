import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { createServer } from 'http';
import { Server } from 'socket.io';
import { router as rootRouter } from "./routes/server.js";
import { initSocket } from './socket.js';
import { Room, Song } from './db.js';

// ── Daily cleanup: delete rooms inactive for > 24 h ──────────────────────────
function scheduleDailyCleanup() {
  const now   = new Date();
  const next  = new Date();
  next.setHours(2, 0, 0, 0); // 2 AM
  if (next <= now) next.setDate(next.getDate() + 1);

  setTimeout(async function run() {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const staleRooms = await Room.find({ lastActive: { $lt: cutoff } }, '_id songs');
      for (const room of staleRooms) {
        if (room.songs.length) await Song.deleteMany({ _id: { $in: room.songs } });
      }
      const ids = staleRooms.map(r => r._id);
      if (ids.length) {
        await Room.deleteMany({ _id: { $in: ids } });
        console.log(`Cleanup: removed ${ids.length} inactive room(s)`);
      }
    } catch (err) { console.error('Cleanup error:', err.message); }
    setTimeout(run, 24 * 60 * 60 * 1000);
  }, next - now);

  console.log(`Room cleanup scheduled — next run at ${next.toLocaleTimeString()}`);
}

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json());

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  });

app.use("/api", rootRouter);
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

initSocket(io);
scheduleDailyCleanup();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
