import { useState } from "react";
import axios from "axios";
import { API } from "../config";

export default function SongCard({ item, rank, token, roomId }) {
  const userId = localStorage.getItem("userId");
  // Use props as source of truth — parent (Dashboard) owns the state via socket events
  const hasVoted = item.voters?.includes(userId);
  const [loading, setLoading] = useState(false);

  const handleUpvote = async () => {
    if (hasVoted || loading) return;
    setLoading(true);
    try {
      await axios.post(
        `${API}/api/user/rooms/${roomId}/songs/${item._id}/upvote`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // No local state update — socket 'song:upvoted' updates parent's songs array
    } catch (err) {
      console.error(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const rankColors = {
    1: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    2: "text-slate-300 border-slate-400/30 bg-slate-400/10",
    3: "text-amber-600 border-amber-600/30 bg-amber-600/10",
  };
  const rankStyle = rankColors[rank] || "text-slate-600 border-white/8 bg-white/5";

  return (
    <div className="flex items-center gap-3 bg-muzix-surface border border-white/8 rounded-xl p-3 hover:border-white/15 transition-all duration-150 group">
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg border text-xs font-black flex items-center justify-center ${rankStyle}`}>
        {rank}
      </div>

      <div className="flex-shrink-0 w-16 h-10 rounded-lg overflow-hidden bg-muzix-bg">
        {item.thumburl ? (
          <img src={item.thumburl} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl">🎵</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-tight line-clamp-2">{item.title || "Unknown song"}</p>
      </div>

      <button
        onClick={handleUpvote}
        disabled={hasVoted || loading}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all duration-200 ${
          hasVoted
            ? "bg-muzix-purple/20 border-muzix-purple/40 text-muzix-purple cursor-default"
            : "bg-white/5 border-white/10 text-slate-300 hover:bg-muzix-purple/10 hover:border-muzix-purple/40 hover:text-muzix-purple hover:scale-105 cursor-pointer"
        } disabled:opacity-60`}
      >
        <span>▲</span>
        <span>{item.upvotes}</span>
      </button>
    </div>
  );
}
