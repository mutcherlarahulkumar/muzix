import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function Createroom() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) navigate('/signin');
  }, [navigate, token]);

  const handleCreate = async () => {
    if (!roomName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(
        `${API}/api/user/create`,
        { roomName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      localStorage.setItem("roomid", res.data.room._id);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create room.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muzix-bg flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 -left-24 w-80 h-80 bg-muzix-purple rounded-full opacity-10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-24 w-80 h-80 bg-muzix-cyan rounded-full opacity-10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-muzix-card border border-white/8 rounded-2xl p-8 shadow-card">
          {/* Icon + header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-3 animate-float">🏠</div>
            <h2 className="text-2xl font-black text-white mb-1">Create a Room</h2>
            <p className="text-slate-400 text-sm">Your friends can join with the room ID</p>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Room Name</label>
            <input
              type="text"
              placeholder="e.g. Friday Night Vibes"
              className="w-full px-4 py-3 rounded-xl bg-muzix-surface border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-muzix-purple focus:ring-1 focus:ring-muzix-purple/50 transition-all"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={loading || !roomName.trim()}
            className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-neon-purple disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
          >
            {loading ? 'Creating…' : 'Create Room'}
          </button>

          <button
            onClick={() => navigate('/home')}
            className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
