import express from "express";
import {User,Room,Song} from "../db.js";
import { authMiddleware } from "./auth.js";
import { fetchVideoDetails } from "./yt.js";

export const router = express();

router.post('/create',authMiddleware,async(req,res)=>{
    //create logic -> ask for the room name and create an priority queue for that 
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

router.post('/join/:roomId',authMiddleware,async(req,res)=>{
    //join logic -> ask for room id
    const { roomId } = req.params;

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!room.users.includes(req.userId)) {
      room.users.push(req.userId);
      await room.save();
    }

    res.status(200).json({ message: "Joined room successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


router.get('/rooms/:roomId',authMiddleware,async(req,res)=>{
    //  Get room details (including song queue)
    const { roomId } = req.params;

  try {
    const room = await Room.findById(roomId).populate("songs");
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    res.status(200).json(room);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});



router.post('/rooms/:roomId/songs',authMiddleware,async(req,res)=>{
    //  Add a new song to the room (admin only)
    const { roomId } = req.params;
  const { link } = req.body;
  //send link and somehow get thumburl and title
  const data = await fetchVideoDetails(link);
  const {title,thumburl} = data;
  // .then((data) => {
  //   const {title,thumburl} = data;
  // })
  
  // .catch((error) => console.error(error));
  //
  console.log(title,thumburl);
  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.admin.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Only admin can add songs" });
    }

    const newSong = new Song({ thumburl,title, link, upvotes: 0 });
    await newSong.save();

    room.songs.push(newSong._id);
    await room.save();

    res.status(201).json({ message: "Song added successfully", song: newSong });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});



// router.get('/rooms/:roomId/songs',authMiddleware,async(req,res)=>{
//     //  List all songs in the room with upvotes.
//     const { roomId } = req.params;

//   try {
//     const room = await Room.findById(roomId).populate("songs");
//     if (!room) {
//       return res.status(404).json({ message: "Room not found" });
//     }

//     res.status(200).json(room.songs);
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });


router.get('/rooms/:roomId/songs', authMiddleware, async (req, res) => {
  const { roomId } = req.params;

  try {
    const songs = await Song.aggregate([
      {
        $match: {
          _id: { $in: (await Room.findById(roomId)).songs }, // Match songs in the room
        },
      },
      {
        $project: {
          title: 1,
          link: 1,
          upvotes: 1,
          voters: 1,
        },
      },
      { $sort: { upvotes: -1 } }, // Sort songs by upvotes in descending order
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
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }

    // Check if the user has already upvoted
    if (song.voters.includes(req.userId)) {
      return res.status(400).json({ message: "You have already upvoted this song" });
    }

    // Increment upvotes and add the user to the voters list
    song.upvotes += 1;
    song.voters.push(req.userId);
    await song.save();

    res.status(200).json({ message: "Song upvoted successfully", song });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


  router.get("/rooms/:roomId/next-song", authMiddleware, async(req,res)=>{
    const { roomId } = req.params;
  
    try {
      const room = await Room.findById(roomId).populate("songs");
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
  
      const nextSong = room.songs.sort((a, b) => b.upvotes - a.upvotes)[0];
  
      if (!nextSong) {
        return res.status(404).json({ message: "No songs in the queue" });
      }
  
      res.status(200).json(nextSong);
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });
