import { useNavigate } from "react-router-dom";

export default function NoPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-muzix-bg flex flex-col items-center justify-center text-center px-4">
      <div className="text-8xl font-black text-white/5 mb-2">404</div>
      <p className="text-2xl font-bold text-white mb-2">Page not found</p>
      <p className="text-slate-500 mb-8 text-sm">This page doesn&apos;t exist.</p>
      <button
        onClick={() => navigate('/')}
        className="px-6 py-3 rounded-xl font-bold text-white text-sm hover:scale-105 transition-all"
        style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
      >
        Go Home
      </button>
    </div>
  );
}
