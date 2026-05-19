import express from "express";
import { User, Room, Song, Template } from "../db.js";
import { authMiddleware } from "./auth.js";
import { fetchVideoDetails } from "./yt.js";
import { getIO } from "../socketInstance.js";

export const router = express.Router();

router.post('/create', authMiddleware, async (req, res) => {
  const { roomName } = req.body;
  try {
    const newRoom = new Room({
      roomName,
      admin: req.userId,
      users: [req.userId],
      songs: [],
    });
    await newRoom.save();
    res.status(201).json({ message: "Room created successfully", room: newRoom });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post('/join/:roomId', authMiddleware, async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (!room.users.includes(req.userId)) {
      room.users.push(req.userId);
      await room.save();
    }
    res.status(200).json({ message: "Joined room successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get('/rooms/:roomId', authMiddleware, async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await Room.findById(roomId).populate("songs");
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.status(200).json(room);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post('/rooms/:roomId/songs', authMiddleware, async (req, res) => {
  const { roomId } = req.params;
  const { link } = req.body;

  const data = await fetchVideoDetails(link);
  const { title, thumburl } = data;

  try {
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (room.admin.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Only admin can add songs" });
    }

    const newSong = new Song({ thumburl, title, link, upvotes: 0, addedBy: req.userId });
    await newSong.save();

    room.songs.push(newSong._id);
    await room.save();

    // Broadcast to everyone in the room
    getIO()?.to(roomId).emit('song:added', {
      _id: newSong._id.toString(),
      title: newSong.title,
      link: newSong.link,
      thumburl: newSong.thumburl,
      upvotes: newSong.upvotes,
      voters: [],
    });

    res.status(201).json({ message: "Song added successfully", song: newSong });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get('/rooms/:roomId/songs', authMiddleware, async (req, res) => {
  const { roomId } = req.params;
  try {
    const songs = await Song.aggregate([
      { $match: { _id: { $in: (await Room.findById(roomId)).songs } } },
      { $project: { title: 1, link: 1, upvotes: 1, voters: 1, thumburl: 1 } },
      { $sort: { upvotes: -1 } },
    ]);
    res.status(200).json(songs);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post('/rooms/:roomId/songs/:songId/upvote', authMiddleware, async (req, res) => {
  const { roomId, songId } = req.params;
  try {
    const song = await Song.findById(songId);
    if (!song) return res.status(404).json({ message: "Song not found" });
    if (song.voters.includes(req.userId)) {
      return res.status(400).json({ message: "You have already upvoted this song" });
    }

    song.upvotes += 1;
    song.voters.push(req.userId);
    await song.save();

    // Broadcast to everyone in the room
    getIO()?.to(roomId).emit('song:upvoted', {
      songId: songId.toString(),
      upvotes: song.upvotes,
      voters: song.voters.map(v => v.toString()),
    });

    res.status(200).json({ message: "Song upvoted successfully", song });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get('/leaderboard', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, 'username xp weeklyXp studySessions').sort({ xp: -1 }).limit(20);
    res.json(users);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.get('/rooms/:roomId/templates', authMiddleware, async (req, res) => {
  try {
    const templates = await Template.find({ roomId: req.params.roomId }).sort({ createdAt: -1 });
    res.json(templates);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.post('/rooms/:roomId/templates', authMiddleware, async (req, res) => {
  const { name, tasks } = req.body;
  if (!name || !tasks?.length) return res.status(400).json({ message: 'Name and tasks required' });
  try {
    const t = await Template.create({ name, tasks, createdBy: req.userId, roomId: req.params.roomId });
    res.status(201).json(t);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/rooms/:roomId/templates/:templateId', authMiddleware, async (req, res) => {
  try {
    await Template.findOneAndDelete({ _id: req.params.templateId, roomId: req.params.roomId });
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.get("/rooms/:roomId/next-song", authMiddleware, async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await Room.findById(roomId).populate("songs");
    if (!room) return res.status(404).json({ message: "Room not found" });
    const nextSong = room.songs.sort((a, b) => b.upvotes - a.upvotes)[0];
    if (!nextSong) return res.status(404).json({ message: "No songs in the queue" });
    res.status(200).json(nextSong);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
