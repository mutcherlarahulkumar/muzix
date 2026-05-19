import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../config";

export default function Signin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/auth/signin`, {
        email,
        password,
      });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.userId);
      localStorage.setItem("username", res.data.username);
      navigate("/home");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Sign in failed. Check your credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muzix-bg flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 -right-24 w-80 h-80 bg-muzix-purple rounded-full opacity-10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-24 w-80 h-80 bg-muzix-pink rounded-full opacity-10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-muzix-card border border-white/8 rounded-2xl p-8 shadow-card backdrop-blur-xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1
              className="text-3xl font-black mb-1"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              MuZix
            </h1>
            <p className="text-slate-400 text-sm">
              Welcome back — sign in to continue
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl bg-muzix-surface border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-muzix-purple focus:ring-1 focus:ring-muzix-purple/50 transition-all"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                placeholder="Your password"
                className="w-full px-4 py-3 rounded-xl bg-muzix-surface border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-muzix-purple focus:ring-1 focus:ring-muzix-purple/50 transition-all"
                onKeyDown={(e) => e.key === "Enter" && handleSignin()}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSignin}
            disabled={loading}
            className="mt-6 w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-neon-purple disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          {/* Footer */}
          <p className="text-center text-sm text-slate-500 mt-5">
            Don&apos;t have an account?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-muzix-purple hover:text-muzix-pink font-semibold transition-colors"
            >
              Create one
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
