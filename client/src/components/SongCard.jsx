import { useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function SongCard({ item, rank, onUpvote }) {
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const roomId = localStorage.getItem("roomid");

  const hasVoted = item.voters?.includes(userId);
  const [voted, setVoted] = useState(hasVoted);
  const [upvotes, setUpvotes] = useState(item.upvotes);
  const [loading, setLoading] = useState(false);

  const handleUpvote = async () => {
    if (voted || loading) return;
    setLoading(true);
    try {
      await axios.post(
        `${API}/api/user/rooms/${roomId}/songs/${item._id}/upvote`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUpvotes((v) => v + 1);
      setVoted(true);
      if (onUpvote) onUpvote();
    } catch (err) {
      console.error(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const rankColors = {
    1: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
    2: 'text-slate-300 border-slate-400/30 bg-slate-400/10',
    3: 'text-amber-600 border-amber-600/30 bg-amber-600/10',
  };
  const rankStyle = rankColors[rank] || 'text-slate-600 border-white/8 bg-white/5';

  return (
    <div className="flex items-center gap-3 bg-muzix-surface border border-white/8 rounded-xl p-3 hover:border-white/15 transition-all duration-150 group">
      {/* Rank */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg border text-xs font-black flex items-center justify-center ${rankStyle}`}>
        {rank}
      </div>

      {/* Thumbnail */}
      <div className="flex-shrink-0 w-16 h-10 rounded-lg overflow-hidden bg-muzix-bg">
        {item.thumburl ? (
          <img src={item.thumburl} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl">🎵</div>
        )}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-tight line-clamp-2">{item.title || 'Unknown song'}</p>
      </div>

      {/* Upvote */}
      <button
        onClick={handleUpvote}
        disabled={voted || loading}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all duration-200
          ${voted
            ? 'bg-muzix-purple/20 border-muzix-purple/40 text-muzix-purple cursor-default'
            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-muzix-purple/10 hover:border-muzix-purple/40 hover:text-muzix-purple hover:scale-105 cursor-pointer'
          } disabled:opacity-60`}
      >
        <span>{voted ? '▲' : '▲'}</span>
        <span>{upvotes}</span>
      </button>
    </div>
  );
}
