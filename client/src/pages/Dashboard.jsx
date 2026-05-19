import axios from "axios";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import SongCard from "../components/SongCard";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const getVideoId = (url) => {
  const match = url?.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  return match ? match[1] : null;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const room_id = localStorage.getItem("roomid");
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");

  const [link, setLink] = useState('');
  const [songs, setSongs] = useState([]);
  const [roomDetails, setRoomDetails] = useState({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) navigate('/signin');
    if (!room_id) navigate('/home');
  }, [navigate, token, room_id]);

  const fetchData = useCallback(() => {
    const headers = { Authorization: `Bearer ${token}` };

    axios.get(`${API}/api/user/rooms/${room_id}/songs`, { headers })
      .then((r) => setSongs(r.data))
      .catch(console.error);

    axios.get(`${API}/api/user/rooms/${room_id}`, { headers })
      .then((r) => setRoomDetails(r.data))
      .catch(console.error);
  }, [room_id, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isAdmin = roomDetails.admin?.toString() === userId;
  const topSong = songs[0];
  const videoId = topSong ? getVideoId(topSong.link) : null;

  const handleAddSong = async () => {
    if (!link.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      await axios.post(
        `${API}/api/user/rooms/${room_id}/songs`,
        { link },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLink('');
      fetchData();
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to add song.');
    } finally {
      setAdding(false);
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(room_id || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-muzix-bg text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-muzix-bg/80 backdrop-blur-xl border-b border-white/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-muzix-muted uppercase tracking-widest">Now in</span>
            <h1 className="text-xl font-black" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {roomDetails.roomName || 'Loading…'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Room ID copy */}
            <button
              onClick={copyRoomId}
              className="flex items-center gap-2 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 hover:bg-white/10 transition-all"
              title="Copy Room ID to share"
            >
              <span className="text-muzix-muted hidden sm:block">Room ID:</span>
              <span className="font-mono text-muzix-cyan truncate max-w-[80px] sm:max-w-[140px]">{room_id}</span>
              <span>{copied ? '✓' : '⎘'}</span>
            </button>

            {isAdmin && (
              <span className="text-xs font-bold bg-gradient-to-r from-muzix-purple to-muzix-pink text-white px-3 py-1.5 rounded-full">
                Admin
              </span>
            )}

            <button
              onClick={() => navigate('/home')}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Add song — admin only */}
        {isAdmin && (
          <div className="mb-6 bg-muzix-card border border-white/8 rounded-2xl p-5">
            <p className="text-xs font-semibold text-muzix-muted uppercase tracking-widest mb-3">Add a Song</p>
            <div className="flex gap-3 flex-col sm:flex-row">
              <input
                type="text"
                value={link}
                placeholder="Paste a YouTube URL…"
                className="flex-1 px-4 py-3 rounded-xl bg-muzix-surface border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-muzix-purple focus:ring-1 focus:ring-muzix-purple/50 transition-all"
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSong()}
              />
              <button
                onClick={handleAddSong}
                disabled={adding || !link.trim()}
                className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-neon-purple disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
              >
                {adding ? 'Adding…' : '+ Add Song'}
              </button>
            </div>
            {addError && (
              <p className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {addError}
              </p>
            )}
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Song queue */}
          <div className="bg-muzix-card border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-muzix-muted uppercase tracking-widest">Queue</p>
              <span className="text-xs text-muzix-muted">{songs.length} song{songs.length !== 1 ? 's' : ''}</span>
            </div>

            {songs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span className="text-5xl mb-4">🎶</span>
                <p className="text-slate-400 text-sm">No songs yet.</p>
                {isAdmin && <p className="text-muzix-muted text-xs mt-1">Add a YouTube link above to get started.</p>}
                {!isAdmin && <p className="text-muzix-muted text-xs mt-1">The admin will add songs.</p>}
              </div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {songs.map((item, idx) => (
                  <SongCard key={item._id} item={item} rank={idx + 1} onUpvote={fetchData} />
                ))}
              </div>
            )}
          </div>

          {/* Player */}
          <div className="bg-muzix-card border border-white/8 rounded-2xl p-5">
            <p className="text-xs font-semibold text-muzix-muted uppercase tracking-widest mb-4">Now Playing</p>

            {videoId ? (
              <div>
                <div className="rounded-xl overflow-hidden aspect-video w-full mb-4">
                  <iframe
                    key={videoId}
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
                    title={topSong?.title || 'YouTube player'}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{topSong?.title}</p>
                    <p className="text-xs text-muzix-muted mt-0.5">Top voted song</p>
                  </div>
                  <span className="flex-shrink-0 text-xs font-bold text-muzix-purple bg-muzix-purple/10 border border-muzix-purple/20 rounded-full px-2.5 py-1">
                    ▲ {topSong?.upvotes}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <span className="text-6xl mb-4 animate-float">🎵</span>
                <p className="text-slate-400 text-sm">Waiting for songs in the queue…</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
