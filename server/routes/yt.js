import fetch from 'node-fetch';

// Extract Video ID
const getVideoId = (url) => {
  const regex = /(?:v=|\/)([0-9A-Za-z_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
};
const apiKey = "AIzaSyCmZRsrfsXNVCQZFYu-OO3L-pgtBSlJA9Q";
// Fetch Video Details
export const fetchVideoDetails = async (url) => {
  const videoId = getVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  // YouTube API for video details
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
  
  const response = await fetch(apiUrl);
  const data = await response.json();

  if (data.items && data.items.length > 0) {
    const { title } = data.items[0].snippet;
    const thumburl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    return { title, thumburl };
  } else {
    throw new Error("Video not found");
  }
};




