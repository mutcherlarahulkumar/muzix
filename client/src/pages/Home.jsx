import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username") || "there";

  useEffect(() => {
    if (!localStorage.getItem("token")) navigate("/signin");
  }, [navigate]);

  return (
    <div className="min-h-screen bg-muzix-bg flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-muzix-purple rounded-full opacity-10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-muzix-pink rounded-full opacity-10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg text-center">
        {/* Greeting */}
        <div className="text-sm font-semibold text-muzix-purple uppercase tracking-widest mb-3">Welcome back</div>
        <h1 className="text-4xl md:text-5xl font-black text-white mb-2">
          Hey, <span style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{username}</span> 👋
        </h1>
        <p className="text-slate-400 mb-12 text-base">What do you want to do today?</p>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Create Room */}
          <button
            onClick={() => navigate('/createroom')}
            className="group relative bg-muzix-card border border-white/8 rounded-2xl p-8 text-left hover:border-muzix-purple/50 hover:shadow-neon-purple hover:scale-[1.03] transition-all duration-200 overflow-hidden"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 70%)' }} />
            <div className="text-4xl mb-4">🏠</div>
            <h2 className="text-lg font-bold text-white mb-1">Create Room</h2>
            <p className="text-sm text-slate-500">Start a new music room and invite friends</p>
          </button>

          {/* Join Room */}
          <button
            onClick={() => navigate('/joinroom')}
            className="group relative bg-muzix-card border border-white/8 rounded-2xl p-8 text-left hover:border-muzix-pink/50 hover:shadow-neon-pink hover:scale-[1.03] transition-all duration-200 overflow-hidden"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 50% 0%, rgba(236,72,153,0.12) 0%, transparent 70%)' }} />
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-lg font-bold text-white mb-1">Join Room</h2>
            <p className="text-sm text-slate-500">Enter a room ID to join your friends</p>
          </button>
        </div>

        {/* Sign out */}
        <button
          onClick={() => { localStorage.clear(); navigate('/'); }}
          className="mt-10 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
