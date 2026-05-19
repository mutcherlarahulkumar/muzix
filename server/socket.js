import mongoose from 'mongoose';
import { setIO } from './socketInstance.js';
import { Room, Song, User } from './db.js';

const roomMembers   = new Map(); // roomId → Map(socketId → { userId, username, socketId })
const roomPlayback  = new Map(); // roomId → { videoId, currentTime, playing, updatedAt }
const roomChat      = new Map(); // roomId → [msgs]
const roomPomodoro  = new Map(); // roomId → { mode, duration, elapsed, startedAt, running, sessions }
const roomTasks     = new Map(); // roomId → [tasks]
const roomSpotlight = new Map(); // roomId → string
const roomScores    = new Map(); // roomId → Map(userId → { username, score })
const roomPomoDone  = new Map(); // roomId → last done timestamp (debounce)

const WORK_DUR  = 25 * 60;
const BREAK_DUR =  5 * 60;

function pomSnapshot(s) {
  if (!s) return null;
  const elapsed = s.running ? s.elapsed + (Date.now() - s.startedAt) / 1000 : s.elapsed;
  return { ...s, elapsed, remaining: Math.max(0, s.duration - elapsed) };
}

function getLeaderboard(roomId) {
  const scores = roomScores.get(roomId);
  if (!scores) return [];
  return Array.from(scores.values()).sort((a, b) => b.score - a.score);
}

async function awardXp(roomId, xpAmount) {
  const members = roomMembers.get(roomId);
  if (!members) return;
  const ids = Array.from(members.values()).map(m => m.userId).filter(Boolean);
  if (!ids.length) return;
  await User.updateMany({ _id: { $in: ids } }, { $inc: { xp: xpAmount, weeklyXp: xpAmount, studySessions: 1 } });
}

export function initSocket(io) {
  setIO(io);

  io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentUser   = null;

    // ── Room join ────────────────────────────────────────────────────────────
    socket.on('room:join', ({ roomId, userId, username }) => {
      currentRoomId = roomId;
      currentUser   = { userId, username, socketId: socket.id };

      socket.join(roomId);
      if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Map());
      roomMembers.get(roomId).set(socket.id, currentUser);

      // Ensure scores entry for this user
      if (!roomScores.has(roomId)) roomScores.set(roomId, new Map());
      if (!roomScores.get(roomId).has(userId)) {
        roomScores.get(roomId).set(userId, { username, score: 0 });
      }

      socket.emit('room:members',   Array.from(roomMembers.get(roomId).values()));
      socket.to(roomId).emit('room:user-joined', currentUser);

      const history = roomChat.get(roomId) || [];
      socket.emit('chat:history', history.slice(-80));

      if (roomPlayback.has(roomId))  socket.emit('playback:state',   roomPlayback.get(roomId));
      if (roomPomodoro.has(roomId))  socket.emit('pomodoro:state',   pomSnapshot(roomPomodoro.get(roomId)));
      if (roomSpotlight.has(roomId)) socket.emit('spotlight:update', { spotlight: roomSpotlight.get(roomId) });
      socket.emit('task:list',       roomTasks.get(roomId) || []);
      socket.emit('room:leaderboard', getLeaderboard(roomId));

      // Touch lastActive on any join
      Room.findByIdAndUpdate(roomId, { lastActive: new Date() }).catch(() => {});
    });

    // ── Chat ─────────────────────────────────────────────────────────────────
    socket.on('chat:message', ({ text }) => {
      if (!currentRoomId || !currentUser || !text?.trim()) return;
      const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, userId: currentUser.userId, username: currentUser.username, text: text.trim().slice(0,500), ts: Date.now() };
      if (!roomChat.has(currentRoomId)) roomChat.set(currentRoomId, []);
      const hist = roomChat.get(currentRoomId);
      hist.push(msg);
      if (hist.length > 200) hist.splice(0, hist.length - 200);
      io.to(currentRoomId).emit('chat:message', msg);
    });

    // ── Song finished ────────────────────────────────────────────────────────
    socket.on('song:finished', async ({ songId, roomId }) => {
      if (!songId || !roomId) return;
      try {
        const oid = new mongoose.Types.ObjectId(songId);
        await Room.findByIdAndUpdate(roomId, { $pull: { songs: oid }, lastActive: new Date() });
        await Song.findByIdAndDelete(oid);
        io.to(roomId).emit('song:removed', { songId });
        roomPlayback.delete(roomId);
      } catch (err) { console.error('song:finished', err.message); }
    });

    // ── Playback sync ────────────────────────────────────────────────────────
    socket.on('playback:update', (state) => {
      if (!currentRoomId) return;
      const updated = { ...state, updatedAt: Date.now() };
      roomPlayback.set(currentRoomId, updated);
      socket.to(currentRoomId).emit('playback:state', updated);
    });

    // ── Spotlight sync ────────────────────────────────────────────────────────
    socket.on('spotlight:set', ({ spotlight }) => {
      if (!currentRoomId) return;
      roomSpotlight.set(currentRoomId, spotlight);
      io.to(currentRoomId).emit('spotlight:update', { spotlight });
    });

    // ── Pomodoro (all users can control) ─────────────────────────────────────
    socket.on('pomodoro:control', ({ action, mode }) => {
      if (!currentRoomId) return;
      let s = roomPomodoro.get(currentRoomId) || { mode: 'work', duration: WORK_DUR, elapsed: 0, startedAt: null, running: false, sessions: 0 };

      if      (action === 'start'    && !s.running) { s = { ...s, running: true, startedAt: Date.now() }; }
      else if (action === 'pause'    && s.running)  { s = { ...s, running: false, elapsed: s.elapsed + (Date.now() - s.startedAt) / 1000, startedAt: null }; }
      else if (action === 'reset')                  { s = { ...s, running: false, elapsed: 0, startedAt: null }; }
      else if (action === 'skip') {
        const wasWork = s.mode === 'work';
        const newMode = wasWork ? 'break' : 'work';
        s = { mode: newMode, duration: newMode === 'work' ? WORK_DUR : BREAK_DUR, elapsed: 0, startedAt: null, running: false, sessions: wasWork ? s.sessions + 1 : s.sessions };
        if (wasWork) awardXp(currentRoomId, 10).catch(console.error);
      } else if (action === 'set-mode') {
        const m = mode || 'work';
        s = { mode: m, duration: m === 'work' ? WORK_DUR : BREAK_DUR, elapsed: 0, startedAt: null, running: false, sessions: s.sessions };
      }

      roomPomodoro.set(currentRoomId, s);
      io.to(currentRoomId).emit('pomodoro:state', pomSnapshot(s));
    });

    // Debounced: only first client to signal done within 5s is processed
    socket.on('pomodoro:done', () => {
      if (!currentRoomId) return;
      const last = roomPomoDone.get(currentRoomId) || 0;
      if (Date.now() - last < 5000) return; // debounce — ignore duplicates from other clients
      roomPomoDone.set(currentRoomId, Date.now());

      const s = roomPomodoro.get(currentRoomId);
      if (!s) return;
      const wasWork = s.mode === 'work';
      const newMode = wasWork ? 'break' : 'work';
      const next = { mode: newMode, duration: newMode === 'work' ? WORK_DUR : BREAK_DUR, elapsed: 0, startedAt: null, running: false, sessions: wasWork ? s.sessions + 1 : s.sessions };
      roomPomodoro.set(currentRoomId, next);
      io.to(currentRoomId).emit('pomodoro:state', pomSnapshot(next));
      io.to(currentRoomId).emit('pomodoro:session-complete', { mode: s.mode, sessions: next.sessions });
      if (wasWork) awardXp(currentRoomId, 10).catch(console.error);
    });

    // ── Tasks (only creator can toggle/delete own tasks) ──────────────────────
    socket.on('task:add', ({ text }) => {
      if (!currentRoomId || !currentUser || !text?.trim()) return;
      if (!roomTasks.has(currentRoomId)) roomTasks.set(currentRoomId, []);
      roomTasks.get(currentRoomId).push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        text: text.trim().slice(0, 200),
        done: false,
        createdBy: currentUser.userId,
        createdByName: currentUser.username,
        ts: Date.now(),
      });
      io.to(currentRoomId).emit('task:list', roomTasks.get(currentRoomId));
    });

    socket.on('task:toggle', ({ id }) => {
      if (!currentRoomId || !currentUser) return;
      const tasks = roomTasks.get(currentRoomId) || [];
      const t = tasks.find(t => t.id === id);
      if (!t || t.createdBy !== currentUser.userId) return; // only creator
      t.done = !t.done;

      // Update room leaderboard score
      if (!roomScores.has(currentRoomId)) roomScores.set(currentRoomId, new Map());
      const scores = roomScores.get(currentRoomId);
      const entry = scores.get(currentUser.userId) || { username: currentUser.username, score: 0 };
      entry.score = Math.max(0, entry.score + (t.done ? 1 : -1));
      scores.set(currentUser.userId, entry);

      io.to(currentRoomId).emit('task:list', tasks);
      io.to(currentRoomId).emit('room:leaderboard', getLeaderboard(currentRoomId));
    });

    socket.on('task:delete', ({ id }) => {
      if (!currentRoomId || !currentUser) return;
      const tasks = roomTasks.get(currentRoomId) || [];
      const idx = tasks.findIndex(t => t.id === id);
      if (idx === -1) return;
      if (tasks[idx].createdBy !== currentUser.userId) return; // only creator
      // Adjust score if done task is deleted
      if (tasks[idx].done) {
        const scores = roomScores.get(currentRoomId);
        if (scores) {
          const entry = scores.get(tasks[idx].createdBy);
          if (entry) { entry.score = Math.max(0, entry.score - 1); }
        }
        io.to(currentRoomId).emit('room:leaderboard', getLeaderboard(currentRoomId));
      }
      tasks.splice(idx, 1);
      io.to(currentRoomId).emit('task:list', tasks);
    });

    socket.on('task:clear', () => {
      if (!currentRoomId) return;
      // Reset scores for tasks being cleared
      const tasks = roomTasks.get(currentRoomId) || [];
      const scores = roomScores.get(currentRoomId);
      if (scores) {
        tasks.filter(t => t.done).forEach(t => {
          const e = scores.get(t.createdBy);
          if (e) e.score = Math.max(0, e.score - 1);
        });
        io.to(currentRoomId).emit('room:leaderboard', getLeaderboard(currentRoomId));
      }
      roomTasks.set(currentRoomId, []);
      io.to(currentRoomId).emit('task:list', []);
    });

    // ── Emoji reactions ───────────────────────────────────────────────────────
    socket.on('reaction:send', ({ emoji }) => {
      if (!currentRoomId || !currentUser) return;
      io.to(currentRoomId).emit('reaction:broadcast', {
        socketId: socket.id,
        userId: currentUser.userId,
        username: currentUser.username,
        emoji,
        id: `${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      });
    });

    // ── WebRTC signaling ──────────────────────────────────────────────────────
    socket.on('webrtc:offer',   ({ to, offer })     => io.to(to).emit('webrtc:offer',   { from: socket.id, fromUser: currentUser, offer }));
    socket.on('webrtc:answer',  ({ to, answer })    => io.to(to).emit('webrtc:answer',  { from: socket.id, answer }));
    socket.on('webrtc:ice',     ({ to, candidate }) => io.to(to).emit('webrtc:ice',     { from: socket.id, candidate }));
    socket.on('webrtc:ready',   () => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit('webrtc:user-ready', { socketId: socket.id, ...currentUser });
    });
    socket.on('webrtc:hangup',  ({ to } = {}) => {
      if (to) io.to(to).emit('webrtc:hangup', { socketId: socket.id });
      else if (currentRoomId) socket.to(currentRoomId).emit('webrtc:hangup', { socketId: socket.id });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (!currentRoomId) return;
      if (roomMembers.has(currentRoomId)) {
        roomMembers.get(currentRoomId).delete(socket.id);
        if (roomMembers.get(currentRoomId).size === 0) {
          roomMembers.delete(currentRoomId);
          roomPlayback.delete(currentRoomId);
        }
      }
      socket.to(currentRoomId).emit('room:user-left', { socketId: socket.id, userId: currentUser?.userId, username: currentUser?.username });
      socket.to(currentRoomId).emit('webrtc:hangup',  { socketId: socket.id });
    });
  });
}
