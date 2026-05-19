import mongoose from 'mongoose';
import { setIO } from './socketInstance.js';
import { Room, Song } from './db.js';

// In-memory state (clears on server restart — fine for now)
const roomMembers = new Map();   // roomId → Map(socketId → { userId, username, socketId })
const roomPlayback = new Map();  // roomId → { videoId, currentTime, playing, updatedAt }
const roomChat = new Map();      // roomId → [{ id, userId, username, text, ts }]

export function initSocket(io) {
  setIO(io);

  io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentUser = null;

    // ── Room join/leave ──────────────────────────────────────────────────────
    socket.on('room:join', ({ roomId, userId, username }) => {
      currentRoomId = roomId;
      currentUser = { userId, username, socketId: socket.id };

      socket.join(roomId);

      if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Map());
      roomMembers.get(roomId).set(socket.id, currentUser);

      // Send current members to the new joiner
      socket.emit('room:members', Array.from(roomMembers.get(roomId).values()));
      // Notify everyone else
      socket.to(roomId).emit('room:user-joined', currentUser);

      // Send last N chat messages to new joiner
      const history = roomChat.get(roomId) || [];
      socket.emit('chat:history', history.slice(-80));

      // Send current playback state
      if (roomPlayback.has(roomId)) {
        socket.emit('playback:state', roomPlayback.get(roomId));
      }
    });

    // ── Chat ─────────────────────────────────────────────────────────────────
    socket.on('chat:message', ({ text }) => {
      if (!currentRoomId || !currentUser || !text?.trim()) return;
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: currentUser.userId,
        username: currentUser.username,
        text: text.trim().slice(0, 500),
        ts: Date.now(),
      };
      if (!roomChat.has(currentRoomId)) roomChat.set(currentRoomId, []);
      const history = roomChat.get(currentRoomId);
      history.push(msg);
      if (history.length > 200) history.splice(0, history.length - 200);
      io.to(currentRoomId).emit('chat:message', msg);
    });

    // ── Song finished — remove from queue, everyone auto-advances ───────────
    socket.on('song:finished', async ({ songId, roomId }) => {
      if (!songId || !roomId) return;
      try {
        const oid = new mongoose.Types.ObjectId(songId);
        // Remove from Room's songs array
        await Room.findByIdAndUpdate(roomId, { $pull: { songs: oid } });
        // Delete the Song document itself — it's been played, no need to keep it
        await Song.findByIdAndDelete(oid);
        // Tell every client in the room to drop it from their queue
        io.to(roomId).emit('song:removed', { songId });
        // Clear playback state so the next song starts from 0:00
        roomPlayback.delete(roomId);
      } catch (err) {
        console.error('song:finished error', err.message);
      }
    });

    // ── Playback sync (admin emits, others receive) ──────────────────────────
    socket.on('playback:update', (state) => {
      if (!currentRoomId) return;
      const updated = { ...state, updatedAt: Date.now() };
      roomPlayback.set(currentRoomId, updated);
      socket.to(currentRoomId).emit('playback:state', updated);
    });

    // ── WebRTC signaling ─────────────────────────────────────────────────────
    socket.on('webrtc:offer', ({ to, offer }) => {
      io.to(to).emit('webrtc:offer', { from: socket.id, fromUser: currentUser, offer });
    });

    socket.on('webrtc:answer', ({ to, answer }) => {
      io.to(to).emit('webrtc:answer', { from: socket.id, answer });
    });

    socket.on('webrtc:ice', ({ to, candidate }) => {
      io.to(to).emit('webrtc:ice', { from: socket.id, candidate });
    });

    // Broadcast to everyone in room that this user is ready for calls
    socket.on('webrtc:ready', () => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit('webrtc:user-ready', {
        socketId: socket.id,
        ...currentUser,
      });
    });

    socket.on('webrtc:hangup', ({ to } = {}) => {
      if (to) {
        io.to(to).emit('webrtc:hangup', { socketId: socket.id });
      } else if (currentRoomId) {
        socket.to(currentRoomId).emit('webrtc:hangup', { socketId: socket.id });
      }
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (!currentRoomId) return;
      if (roomMembers.has(currentRoomId)) {
        roomMembers.get(currentRoomId).delete(socket.id);
        if (roomMembers.get(currentRoomId).size === 0) {
          roomMembers.delete(currentRoomId);
          roomPlayback.delete(currentRoomId);
        }
      }
      socket.to(currentRoomId).emit('room:user-left', {
        socketId: socket.id,
        userId: currentUser?.userId,
        username: currentUser?.username,
      });
      socket.to(currentRoomId).emit('webrtc:hangup', { socketId: socket.id });
    });
  });
}
