import { useNavigate } from "react-router-dom"

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muzix-bg flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] bg-muzix-purple rounded-full opacity-10 blur-3xl animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-[500px] h-[500px] bg-muzix-pink rounded-full opacity-10 blur-3xl animate-pulse-slow pointer-events-none" style={{ animationDelay: '2s' }} />
      <div className="absolute top-3/4 left-1/3 w-64 h-64 bg-muzix-cyan rounded-full opacity-5 blur-3xl pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs font-semibold text-muzix-purple uppercase tracking-widest mb-8">
          <span className="w-2 h-2 rounded-full bg-muzix-purple animate-pulse" />
          Collaborative Music Experience
        </div>

        {/* Logo */}
        <h1 className="text-7xl md:text-9xl font-black mb-6 leading-none tracking-tight">
          <span style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 60%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            MuZix
          </span>
        </h1>

        {/* Tagline */}
        <p className="text-xl md:text-2xl text-slate-300 font-medium mb-3 max-w-xl mx-auto leading-relaxed">
          Create rooms · Queue songs · Let the crowd vote
        </p>
        <p className="text-sm text-muzix-muted mb-14 tracking-wide">~ By Rahul Kumar Mutcherla</p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={() => navigate('/signin')}
            className="w-44 py-3.5 rounded-xl font-bold text-white text-base transition-all duration-200 hover:scale-105 hover:shadow-neon-purple"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
          >
            Sign In
          </button>
          <button
            onClick={() => navigate('/signup')}
            className="w-44 py-3.5 rounded-xl font-bold text-white text-base border border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/25 hover:scale-105 transition-all duration-200"
          >
            Create Account
          </button>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mt-16">
          {["🎵 YouTube Queue", "🔥 Upvote System", "🏠 Private Rooms", "⚡ Real-time"].map((f) => (
            <span key={f} className="text-xs text-slate-400 bg-white/5 border border-white/8 rounded-full px-4 py-1.5">
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
