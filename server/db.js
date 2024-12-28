import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdRooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],
  joinedRooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }]
});

const roomSchema = new mongoose.Schema({
  // roomId: { type: String, required: true, unique: true },
  roomName: { type: String, required: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
  currentSong: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
  songQueue: [{ songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' }, upvotes: { type: Number } }]
});

const songSchema = new mongoose.Schema({
  // songId: { type: String, required: true, unique: true },
  link: { type: String, required: true },
  title: { type: String },
  thumburl: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  upvotes: { type: Number, default: 0 },
  voters: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});

export const User = mongoose.model('User', userSchema);
export const Room = mongoose.model('Room', roomSchema);
export const Song = mongoose.model('Song', songSchema);

// module.exports = { User, Room, Song };
