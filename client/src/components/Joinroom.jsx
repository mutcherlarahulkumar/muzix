import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { API } from "../config";

export default function Joinroom() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) navigate("/signin");
  }, [navigate, token]);

  const handleJoin = async () => {
    if (!roomId.trim()) return;
    setLoading(true);
    setError("");
    try {
      await axios.post(
        `${API}/api/user/join/${roomId.trim()}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      localStorage.setItem("roomid", roomId.trim());
      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Room not found. Check the ID and try again.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muzix-bg flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 -right-24 w-80 h-80 bg-muzix-pink rounded-full opacity-10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-24 w-80 h-80 bg-muzix-cyan rounded-full opacity-10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-muzix-card border border-white/8 rounded-2xl p-8 shadow-card">
          {/* Icon + header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-3 animate-float">🎉</div>
            <h2 className="text-2xl font-black text-white mb-1">Join a Room</h2>
            <p className="text-slate-400 text-sm">
              Ask your friend for the room ID
            </p>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Room ID
            </label>
            <input
              type="text"
              placeholder="Paste room ID here…"
              className="w-full px-4 py-3 rounded-xl bg-muzix-surface border border-white/10 text-white placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-muzix-pink focus:ring-1 focus:ring-muzix-pink/50 transition-all"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={loading || !roomId.trim()}
            className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-neon-pink disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ background: "linear-gradient(135deg, #ec4899, #8b5cf6)" }}
          >
            {loading ? "Joining…" : "Join Room"}
          </button>

          <button
            onClick={() => navigate("/home")}
            className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
