import axios from "axios";
import { useEffect, useState, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import SongCard from "../components/SongCard";
import { API } from "../config";

const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const getVideoId = (url) => url?.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] ?? null;
const initials   = (n = "?") => n.slice(0, 2).toUpperCase();
const COLORS     = ["#8b5cf6","#ec4899","#06b6d4","#f59e0b","#10b981","#ef4444","#6366f1","#f97316"];
const avatarClr  = (s = "") => COLORS[(s?.charCodeAt(0) ?? 0) % COLORS.length];
const fmt = (sec) => { const s = Math.max(0, Math.floor(sec)); return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; };

const REACTION_EMOJIS = ["👍","❤️","😂","🔥","🎉","👏","🍅","😮"];

// ── VideoTile ─────────────────────────────────────────────────────────────────
function VideoTile({ stream, username, local, deafened, large, reactions = [] }) {
  const nodeRef = useRef(null);
  const setRef  = useCallback((node) => {
    nodeRef.current = node;
    if (node) { node.srcObject = stream ?? null; node.muted = !!(local || deafened); }
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (nodeRef.current) nodeRef.current.muted = !!(local || deafened); }, [local, deafened]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-muzix-surface border border-white/10 flex-shrink-0 ${large ? "w-full h-full" : "w-24 h-[4rem]"}`}>
      <video ref={setRef} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
      <span className="absolute bottom-1 left-1.5 text-[9px] font-semibold text-white/90 truncate max-w-[80px]">{local ? "You" : username}</span>
      {/* Floating emoji reactions — position stored at creation time */}
      {reactions.map(r => (
        <span key={r.id} className="reaction-float" style={{ left: `${r.left}%`, bottom: "12%" }}>
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

// ── AudioPlayer ───────────────────────────────────────────────────────────────
function AudioPlayer({ stream, muted }) {
  const nodeRef = useRef(null);
  const setRef  = useCallback((node) => { nodeRef.current = node; if (node) node.srcObject = stream ?? null; }, [stream]);
  useEffect(() => { if (nodeRef.current) nodeRef.current.muted = !!muted; }, [muted]);
  return <audio ref={setRef} autoPlay playsInline style={{ display: "none" }} />;
}

// ── IconBtn ───────────────────────────────────────────────────────────────────
function IconBtn({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all active:scale-95 flex-shrink-0
        ${active ? "bg-white/8 border-white/10 text-white hover:bg-white/15" : "bg-red-500/15 border-red-500/25 text-red-400 hover:bg-red-500/25"}`}>
      {children}
    </button>
  );
}

// ── Pomodoro Panel (all users can control) ────────────────────────────────────
function PomodoroPanel({ state, onControl, onDone }) {
  const [, setTick] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!state?.running) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [state?.running]);

  if (!state) return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <span className="text-5xl">🍅</span>
      <p className="text-slate-500 text-sm">Start a focus session</p>
      <button onClick={() => onControl('start')}
        className="px-5 py-2.5 rounded-xl text-sm font-bold text-white animate-pop-in"
        style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
        Start Session
      </button>
    </div>
  );

  const elapsed   = state.running ? state.elapsed + (Date.now() - state.startedAt) / 1000 : state.elapsed;
  const remaining = Math.max(0, state.duration - elapsed);

  if (remaining === 0 && state.running && !doneRef.current) {
    doneRef.current = true;
    onDone();
  }
  if (remaining > 0) doneRef.current = false;

  const pct = 1 - remaining / state.duration;
  const r = 54, circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 select-none">
      <div className="flex gap-2">
        {['work','break'].map(m => (
          <button key={m} onClick={() => onControl('set-mode', m)}
            className={`text-xs px-3 py-1 rounded-full font-semibold transition-all capitalize ${state.mode===m ? (m==='work'?"bg-muzix-purple text-white":"bg-muzix-cyan text-black") : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
            {m === 'work' ? '🍅 Work' : '☕ Break'}
          </button>
        ))}
      </div>

      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 124 124">
          <circle cx="62" cy="62" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="9" fill="none" />
          <circle cx="62" cy="62" r={r} stroke={state.mode==='work'?"#8b5cf6":"#06b6d4"}
            strokeWidth="9" fill="none" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-white tabular-nums">{fmt(remaining)}</span>
          <span className="text-[10px] text-slate-400 capitalize mt-0.5">{state.mode}</span>
        </div>
      </div>

      <p className="text-xs text-slate-500">Session #{state.sessions + 1}</p>

      <div className="flex gap-2">
        {state.running
          ? <button onClick={() => onControl('pause')} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-white/8 border border-white/10 text-white hover:bg-white/15 transition-all">⏸ Pause</button>
          : <button onClick={() => onControl('start')} className="px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all" style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>▶ Start</button>}
        <button onClick={() => onControl('reset')} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all">↺</button>
        <button onClick={() => onControl('skip')}  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all">⏭</button>
      </div>
    </div>
  );
}

// ── Task Panel ─────────────────────────────────────────────────────────────────
function TaskPanel({ tasks, socket, isAdmin, roomId, token, currentUserId }) {
  const [input,     setInput]     = useState("");
  const [templates, setTemplates] = useState([]);
  const [saveName,  setSaveName]  = useState("");
  const [showSave,  setShowSave]  = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/user/rooms/${roomId}/templates`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setTemplates(r.data)).catch(() => {});
  }, [roomId, token]);

  const add = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    socket?.emit('task:add', { text: input.trim() });
    setInput("");
  };

  const saveTemplate = async () => {
    if (!saveName.trim() || !tasks.length) return;
    try {
      const r = await axios.post(`${API}/api/user/rooms/${roomId}/templates`, { name: saveName.trim(), tasks: tasks.map(t => t.text) }, { headers: { Authorization: `Bearer ${token}` } });
      setTemplates(p => [r.data, ...p]);
      setSaveName(""); setShowSave(false);
    } catch {}
  };

  const loadTemplate = (t) => {
    socket?.emit('task:clear');
    t.tasks.forEach(text => socket?.emit('task:add', { text }));
  };

  const deleteTemplate = async (id) => {
    await axios.delete(`${API}/api/user/rooms/${roomId}/templates/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    setTemplates(p => p.filter(t => t._id !== id));
  };

  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const myTasks = tasks.filter(t => t.createdBy === currentUserId);

  return (
    <div className="flex flex-col h-full gap-2">
      {total > 0 && (
        <div className="flex-shrink-0">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>{done}/{total} done</span><span>{Math.round(100*done/total)}%</span>
          </div>
          <div className="h-1 bg-white/8 rounded-full overflow-hidden">
            <div className="h-full bg-muzix-purple rounded-full transition-all duration-500" style={{ width:`${total?100*done/total:0}%` }} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {tasks.length === 0 && <p className="text-xs text-slate-600 text-center mt-4">No tasks yet — add one below</p>}
        {tasks.map(t => {
          const isMine = t.createdBy === currentUserId;
          return (
            <div key={t.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg transition-all ${t.done ? "opacity-50" : "bg-white/3"}`}>
              <button
                onClick={() => isMine && socket?.emit('task:toggle', { id: t.id })}
                title={isMine ? "Toggle" : "Only you can complete your own tasks"}
                className={`flex-shrink-0 w-4 h-4 mt-0.5 rounded border transition-all
                  ${t.done ? "bg-muzix-purple border-muzix-purple" : isMine ? "border-white/20 hover:border-muzix-purple cursor-pointer" : "border-white/10 cursor-not-allowed opacity-50"}`}>
                {t.done && <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-xs leading-relaxed ${t.done ? "line-through text-slate-500" : "text-slate-200"}`}>{t.text}</p>
                <p className="text-[9px] text-slate-600 mt-0.5">{isMine ? "You" : t.createdByName}</p>
              </div>
              {isMine && (
                <button onClick={() => socket?.emit('task:delete', { id: t.id })} className="flex-shrink-0 text-slate-600 hover:text-red-400 text-[10px] transition-all mt-0.5">✕</button>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={add} className="flex-shrink-0 flex gap-1.5">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Add your task…"
          className="flex-1 bg-muzix-card border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-muzix-purple transition-all min-w-0" />
        <button type="submit" disabled={!input.trim()} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-40 flex-shrink-0" style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>+</button>
      </form>

      <div className="flex-shrink-0 border-t border-white/8 pt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Templates</span>
          {myTasks.length > 0 && <button onClick={() => setShowSave(s => !s)} className="text-[10px] text-muzix-purple hover:text-muzix-pink transition-colors">Save list</button>}
        </div>
        {showSave && (
          <div className="flex gap-1.5 mb-2">
            <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Template name…"
              className="flex-1 bg-muzix-card border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-muzix-purple min-w-0" />
            <button onClick={saveTemplate} disabled={!saveName.trim()} className="px-2 py-1 rounded-lg text-[10px] font-bold text-white disabled:opacity-40" style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>Save</button>
          </div>
        )}
        <div className="space-y-1 max-h-20 overflow-y-auto">
          {templates.length === 0 && <p className="text-[10px] text-slate-600">No saved templates</p>}
          {templates.map(t => (
            <div key={t._id} className="flex items-center gap-1.5 group">
              <button onClick={() => loadTemplate(t)} className="flex-1 text-left text-[10px] text-slate-400 hover:text-white transition-colors truncate">{t.name} <span className="text-slate-600">({t.tasks.length})</span></button>
              {isAdmin && <button onClick={() => deleteTemplate(t._id)} className="text-[9px] text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">✕</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Room Leaderboard Modal ────────────────────────────────────────────────────
function LeaderboardModal({ leaderboard, onClose, currentUserId }) {
  const medals = ["🥇","🥈","🥉"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-muzix-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-pop-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div>
            <h2 className="font-black text-sm" style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Room Leaderboard</h2>
            <p className="text-[10px] text-slate-500">Ranked by tasks completed this session</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
          {leaderboard.length === 0 && <p className="text-xs text-slate-500 text-center py-6">Complete tasks to appear here 🎯</p>}
          {leaderboard.map((u, i) => (
            <div key={u.username} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${u.userId === currentUserId ? "bg-muzix-purple/10 border border-muzix-purple/20" : "bg-white/3 hover:bg-white/5"}`}>
              <span className="w-6 text-center text-sm flex-shrink-0">{i < 3 ? medals[i] : `${i+1}`}</span>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ background: avatarClr(u.username) }}>{initials(u.username)}</div>
              <p className="flex-1 text-xs font-semibold text-white truncate">{u.username} {u.userId === currentUserId && <span className="text-[9px] text-muzix-purple">(you)</span>}</p>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-black text-muzix-purple">{u.score}</p>
                <p className="text-[9px] text-slate-600">tasks</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MemoSongCard = memo(SongCard);

// ── Dashboard ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate  = useNavigate();
  const room_id   = localStorage.getItem("roomid");
  const token     = localStorage.getItem("token");
  const userId    = localStorage.getItem("userId");
  const username  = localStorage.getItem("username") || "Guest";

  const [songs,       setSongs]       = useState([]);
  const [roomDetails, setRoomDetails] = useState({});
  const [link,        setLink]        = useState("");
  const [adding,      setAdding]      = useState(false);
  const [addError,    setAddError]    = useState("");
  const [copied,      setCopied]      = useState(false);
  const [connected,   setConnected]   = useState(false);
  const [members,     setMembers]     = useState([]);

  const [chatOpen,  setChatOpen]  = useState(false);
  const [messages,  setMessages]  = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [unread,    setUnread]    = useState(0);

  const [inCall,      setInCall]      = useState(false);
  const [micOn,       setMicOn]       = useState(true);
  const [camOn,       setCamOn]       = useState(true);
  const [deafened,    setDeafened]    = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [peers,       setPeers]       = useState({});

  const [stage,       setStage]       = useState('youtube'); // main stage: youtube|pomodoro|tasks|peer:<id>

  const [pomState,    setPomState]    = useState(null);
  const [tasks,       setTasks]       = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeader,  setShowLeader]  = useState(false);
  const [xpToast,     setXpToast]     = useState(null);
  const [sidePanel,   setSidePanel]   = useState(null); // null | 'chat' | 'tasks'
  const [showQueue,   setShowQueue]   = useState(false); // mobile queue drawer

  // Emoji reactions: flat list of { id, emoji, username, socketId, left }
  const [reactions,     setReactions]     = useState([]);
  const [showEmojiBar,  setShowEmojiBar]  = useState(false);

  const socketRef      = useRef(null);
  const playerRef      = useRef(null);
  const playerReadyRef = useRef(false);
  const isSyncingRef   = useRef(false);
  const isAdminRef     = useRef(false);
  const currentVidRef  = useRef(null);
  const peersRef       = useRef({});
  const localStreamRef = useRef(null);
  const chatOpenRef    = useRef(false);
  const songsRef       = useRef([]);
  const chatEndRef     = useRef(null);

  const isAdmin  = roomDetails.admin?.toString() === userId;
  const topSong  = songs[0];
  const videoId  = topSong ? getVideoId(topSong.link) : null;
  const peerList = Object.entries(peers);

  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
  useEffect(() => { chatOpenRef.current = sidePanel === 'chat'; }, [sidePanel]);
  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { if (!token) navigate("/signin"); if (!room_id) navigate("/home"); }, [navigate, token, room_id]);

  // ── Initial fetch ─────────────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    if (!token || !room_id) return;
    const h = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/api/user/rooms/${room_id}/songs`, { headers: h }).then(r => setSongs(r.data)).catch(console.error);
    axios.get(`${API}/api/user/rooms/${room_id}`,       { headers: h }).then(r => setRoomDetails(r.data)).catch(console.error);
  }, [room_id, token]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Chat scroll
  useEffect(() => {
    if (sidePanel === 'chat') { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); setUnread(0); }
  }, [messages, sidePanel]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const closePeer = useCallback((sid) => {
    peersRef.current[sid]?.pc?.close();
    delete peersRef.current[sid];
    setPeers(p => { const n = { ...p }; delete n[sid]; return n; });
  }, []);

  const makePeer = useCallback((sid, peerName) => {
    if (peersRef.current[sid]?.pc) { try { peersRef.current[sid].pc.close(); } catch (_) {} }
    const pc = new RTCPeerConnection(STUN);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    pc.onicecandidate = (e) => { if (e.candidate) socketRef.current?.emit("webrtc:ice", { to: sid, candidate: e.candidate }); };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      setPeers(p => ({ ...p, [sid]: { stream, username: peerName } }));
      peersRef.current[sid] = { ...peersRef.current[sid], stream, username: peerName };
    };
    pc.onconnectionstatechange = () => { if (["disconnected","failed","closed"].includes(pc.connectionState)) closePeer(sid); };
    peersRef.current[sid] = { pc, username: peerName };
    return pc;
  }, [closePeer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !room_id || !userId) return;
    const socket = io(API, { auth: { token }, transports: ["websocket","polling"] });
    socketRef.current = socket;

    socket.on("connect",    () => { setConnected(true); socket.emit("room:join", { roomId: room_id, userId, username }); });
    socket.on("disconnect", () => setConnected(false));

    socket.on("room:members",     (list) => setMembers(list));
    socket.on("room:user-joined", (u)    => setMembers(p => [...p.filter(m => m.userId !== u.userId), u]));
    socket.on("room:user-left",   ({ socketId }) => setMembers(p => p.filter(m => m.socketId !== socketId)));

    socket.on("song:removed",  ({ songId })              => setSongs(p => p.filter(s => s._id !== songId)));
    socket.on("song:added",    (s)                       => setSongs(p => p.some(x => x._id === s._id) ? p : [...p, s].sort((a,b) => b.upvotes - a.upvotes)));
    socket.on("song:upvoted",  ({ songId, upvotes, voters }) => setSongs(p => p.map(s => s._id === songId ? { ...s, upvotes, voters } : s).sort((a,b) => b.upvotes - a.upvotes)));

    socket.on("chat:history", setMessages);
    socket.on("chat:message", (msg) => {
      setMessages(p => [...p, msg]);
      if (!chatOpenRef.current) setUnread(u => u + 1);
    });

    // Playback: non-admins never auto-play on reload
    socket.on("playback:state", ({ videoId: vid, currentTime, playing, updatedAt }) => {
      if (isAdminRef.current) return;
      isSyncingRef.current = true;
      if (playerRef.current && vid && vid !== currentVidRef.current) { currentVidRef.current = vid; playerRef.current.loadVideoById(vid); }
      const syncTime = currentTime + (Date.now() - updatedAt) / 1000;
      setTimeout(() => {
        if (!playerRef.current) return;
        playerRef.current.seekTo(syncTime, true);
        playing ? playerRef.current.playVideo() : playerRef.current.pauseVideo();
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      }, 300);
    });

    // Spotlight — admin broadcasts, all clients follow
    socket.on("spotlight:update", ({ spotlight }) => setStage(spotlight || 'youtube'));

    // Pomodoro
    socket.on("pomodoro:state",            (s)          => setPomState(s));
    socket.on("pomodoro:session-complete", ({ mode })   => {
      const msg = mode === 'work' ? "🍅 +10 XP — Focus session done!" : "☕ Break over, back to work!";
      setXpToast(msg);
      setTimeout(() => setXpToast(null), 3500);
    });

    // Tasks & leaderboard
    socket.on("task:list",       setTasks);
    socket.on("room:leaderboard", setLeaderboard);

    // Emoji reactions — store flat, expire after 2.8s
    socket.on("reaction:broadcast", ({ socketId, username: rUser, emoji, id }) => {
      const left = 10 + Math.random() * 80;
      const entry = { id, emoji, username: rUser, socketId, left };
      setReactions(r => [...r, entry]);
      setTimeout(() => setReactions(r => r.filter(x => x.id !== id)), 2800);
    });

    // WebRTC
    socket.on("webrtc:user-ready", async ({ socketId, username: pu }) => {
      if (!localStreamRef.current) return;
      const pc = makePeer(socketId, pu);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { to: socketId, offer });
    });
    socket.on("webrtc:offer", async ({ from, fromUser, offer }) => {
      if (!localStreamRef.current) return;
      const pc = makePeer(from, fromUser?.username);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { to: from, answer });
    });
    socket.on("webrtc:answer", async ({ from, answer }) => {
      const peer = peersRef.current[from];
      if (peer?.pc) await peer.pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
    });
    socket.on("webrtc:ice", async ({ from, candidate }) => {
      try { await peersRef.current[from]?.pc?.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    });
    socket.on("webrtc:hangup", ({ socketId }) => closePeer(socketId));

    return () => { socket.disconnect(); socketRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, room_id, userId, username]);

  // ── YouTube IFrame API ────────────────────────────────────────────────────
  useEffect(() => {
    if (window.YT?.Player || document.getElementById("yt-api-script")) return;
    const tag = document.createElement("script");
    tag.id = "yt-api-script"; tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); window.dispatchEvent(new Event("yt-ready")); };
  }, []);

  useEffect(() => {
    if (!videoId) return;
    const init = () => {
      if (!window.YT?.Player) return;
      currentVidRef.current = videoId;
      if (playerReadyRef.current && playerRef.current) {
        try {
          if (playerRef.current.getVideoData?.()?.video_id !== videoId) {
            isSyncingRef.current = true;
            // admin loads and plays; non-admin cues silently until playback:state arrives
            if (isAdminRef.current) playerRef.current.loadVideoById(videoId);
            else playerRef.current.cueVideoById(videoId);
            setTimeout(() => { isSyncingRef.current = false; }, 2000);
          }
        } catch (_) {}
        return;
      }
      if (!document.getElementById("yt-player")) return;
      playerReadyRef.current = true;
      playerRef.current = new window.YT.Player("yt-player", {
        width: "100%", height: "100%", videoId,
        playerVars: { autoplay: isAdminRef.current ? 1 : 0, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onStateChange: (ev) => {
            if (!isAdminRef.current) return;
            const s = ev.data;
            if (s === 1 || s === 2) {
              // Always let admin's own play/pause emit — never block with isSyncingRef
              socketRef.current?.emit("playback:update", { videoId: currentVidRef.current, currentTime: playerRef.current.getCurrentTime(), playing: s === 1 });
            } else if (s === 0 && !isSyncingRef.current) {
              // Only detect song-end when not in a loading transition (avoids false triggers)
              const finishedId = songsRef.current[0]?._id;
              if (finishedId) socketRef.current?.emit("song:finished", { songId: finishedId, roomId: room_id });
            }
          },
        },
      });
    };
    if (window.YT?.Player) { init(); }
    else {
      window.addEventListener("yt-ready", init, { once: true });
      const t = setTimeout(() => { if (window.YT?.Player) init(); }, 1500);
      return () => { clearTimeout(t); window.removeEventListener("yt-ready", init); };
    }
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    try { playerRef.current?.destroy(); } catch (_) {}
    playerRef.current = null; playerReadyRef.current = false;
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const joinCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setInCall(true);
      socketRef.current?.emit("webrtc:ready");
    } catch (err) { alert("Camera/mic access denied.\n" + (err.message || err)); }
  };

  const leaveCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null; setLocalStream(null);
    Object.keys(peersRef.current).forEach(id => { try { peersRef.current[id]?.pc?.close(); } catch (_) {} });
    peersRef.current = {}; setPeers({});
    socketRef.current?.emit("webrtc:hangup", {});
    setInCall(false);
  };

  const toggleMic = () => { const t = localStreamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); } };
  const toggleCam = () => { const t = localStreamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); } };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketRef.current?.emit("chat:message", { text: chatInput.trim() });
    setChatInput("");
  };

  const handleAddSong = async () => {
    if (!link.trim()) return;
    setAdding(true); setAddError("");
    try {
      await axios.post(`${API}/api/user/rooms/${room_id}/songs`, { link }, { headers: { Authorization: `Bearer ${token}` } });
      setLink("");
    } catch (err) { setAddError(err.response?.data?.message || "Failed to add song."); }
    finally { setAdding(false); }
  };

  const copyRoomId = () => { navigator.clipboard.writeText(room_id || ""); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  // Admin pins broadcast to everyone; non-admin pins are local only
  const pinStage = (s) => {
    setStage(s);
    if (isAdmin) socketRef.current?.emit('spotlight:set', { spotlight: s });
  };

  const sendReaction = (emoji) => {
    socketRef.current?.emit('reaction:send', { emoji });
    setShowEmojiBar(false);
  };

  const toggleSide = (panel) => {
    setSidePanel(p => p === panel ? null : panel);
    if (panel === 'chat') setUnread(0);
  };

  const isPeerStage = stage?.startsWith('peer:');
  const peerId      = isPeerStage ? stage.replace('peer:', '') : null;
  const isYtHidden  = stage !== 'youtube';
  const mySocketId  = socketRef.current?.id;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-muzix-bg text-white flex flex-col overflow-hidden">

      {peerList.map(([id, { stream }]) => <AudioPlayer key={id} stream={stream} muted={deafened} />)}

      {/* XP toast */}
      {xpToast && (
        <div className="fixed top-16 left-1/2 z-50 bg-muzix-purple/90 border border-muzix-purple text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg backdrop-blur-sm pointer-events-none animate-fade-in">
          {xpToast}
        </div>
      )}

      {showLeader && <LeaderboardModal leaderboard={leaderboard} currentUserId={userId} onClose={() => setShowLeader(false)} />}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-white/8 bg-muzix-bg/95 backdrop-blur-xl z-30">
        <div className="max-w-[1600px] mx-auto px-3 h-12 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? "bg-green-400" : "bg-red-400 animate-pulse"}`} />
          <h1 className="font-black text-sm truncate flex-1 min-w-0" style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            {roomDetails.roomName || "…"}
          </h1>
          {isAdmin && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0 hidden sm:block" style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>Admin</span>}
          <button onClick={() => setShowLeader(true)} title="Leaderboard" className="flex-shrink-0 text-sm bg-white/5 border border-white/10 rounded-lg px-2 py-1 hover:bg-white/10 transition-all">🏆</button>
          <button onClick={copyRoomId} className="flex items-center gap-1 text-[11px] bg-white/5 border border-white/10 rounded-lg px-2 py-1 hover:bg-white/10 transition-all flex-shrink-0">
            <span className="font-mono text-muzix-cyan max-w-[60px] truncate hidden sm:block">{room_id}</span>
            <span className="text-muzix-muted">{copied ? "✓" : "⎘"}</span>
          </button>
          <button onClick={() => navigate("/home")} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">← Leave</button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden max-w-[1600px] w-full mx-auto">

        {/* ── Main column ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Admin: add song */}
          {isAdmin && (
            <div className="flex-shrink-0 px-3 pt-2.5">
              <div className="flex gap-2">
                <input value={link} placeholder="Paste a YouTube URL…" onChange={e => setLink(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAddSong()}
                  className="flex-1 px-3 py-2 rounded-xl bg-muzix-card border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-muzix-purple focus:ring-1 focus:ring-muzix-purple/40 transition-all min-w-0" />
                <button onClick={handleAddSong} disabled={adding || !link.trim()}
                  className="px-3 py-2 rounded-xl font-bold text-sm text-white disabled:opacity-40 hover:brightness-110 transition-all whitespace-nowrap flex-shrink-0"
                  style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                  {adding ? "…" : "+ Add"}
                </button>
              </div>
              {addError && <p className="mt-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1">{addError}</p>}
            </div>
          )}

          {/* Stage tabs */}
          <div className="flex-shrink-0 flex items-center gap-1 px-3 pt-2 overflow-x-auto">
            {[
              { id: 'youtube',  label: '🎵 Music' },
              { id: 'pomodoro', label: `🍅 Focus${pomState?.running ? ' ●' : ''}` },
              { id: 'tasks',    label: `✅ Tasks${tasks.length ? ` (${tasks.length})` : ''}` },
            ].map(tab => (
              <button key={tab.id} onClick={() => pinStage(tab.id)}
                className={`flex-shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full transition-all ${stage===tab.id ? "bg-muzix-purple text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
                {tab.label}
              </button>
            ))}
            {inCall && peerList.map(([id, { username: pu }]) => (
              <button key={id} onClick={() => pinStage(`peer:${id}`)}
                className={`flex-shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full transition-all ${stage===`peer:${id}` ? "bg-muzix-pink text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
                📹 {pu}
              </button>
            ))}
          </div>

          {/* ── Stage + Queue grid ───────────────────────────────────────────── */}
          <div className="flex-1 flex gap-3 p-3 overflow-hidden min-h-0">

            {/* Stage */}
            <div className="flex-1 min-h-0 min-w-0 relative">
              {/* Emoji reaction overlay — always visible, floats over stage content */}
              <div className="absolute inset-0 pointer-events-none z-20">
                {reactions.map(r => (
                  <div key={r.id} className="reaction-float flex flex-col items-center gap-0.5" style={{ left: `${r.left}%`, bottom: "15%" }}>
                    <span className="text-3xl">{r.emoji}</span>
                    <span className="text-[9px] text-white/70 font-semibold bg-black/40 px-1.5 py-0.5 rounded-full whitespace-nowrap">{r.username}</span>
                  </div>
                ))}
              </div>
              {isPeerStage && peers[peerId] && (
                <div className="h-full relative rounded-2xl overflow-hidden bg-black border border-white/8">
                  <VideoTile stream={peers[peerId].stream} username={peers[peerId].username} deafened={deafened} large reactions={reactions.filter(r => r.socketId === peerId)} />
                </div>
              )}
              {stage === 'peer:self' && localStream && (
                <div className="h-full relative rounded-2xl overflow-hidden bg-black border border-white/8">
                  <VideoTile stream={localStream} username={username} local large reactions={reactions.filter(r => r.socketId === mySocketId)} />
                </div>
              )}
              {stage === 'pomodoro' && (
                <div className="h-full rounded-2xl bg-muzix-card border border-white/8 p-4">
                  <PomodoroPanel state={pomState} onControl={(action, mode) => socketRef.current?.emit('pomodoro:control', { action, mode })} onDone={() => socketRef.current?.emit('pomodoro:done')} />
                </div>
              )}
              {stage === 'tasks' && (
                <div className="h-full rounded-2xl bg-muzix-card border border-white/8 p-3 flex flex-col">
                  <div className="flex-shrink-0 flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-muzix-muted uppercase tracking-widest">Session Goals</span>
                    {isAdmin && <button onClick={() => socketRef.current?.emit('task:clear')} className="text-[10px] text-slate-600 hover:text-red-400 transition-colors">Clear all</button>}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <TaskPanel tasks={tasks} socket={socketRef.current} isAdmin={isAdmin} roomId={room_id} token={token} currentUserId={userId} />
                  </div>
                </div>
              )}
              {/* YouTube — always in DOM to keep IFrame alive */}
              <div className={`rounded-2xl overflow-hidden bg-muzix-card border border-white/8 transition-all ${isYtHidden ? "h-0 overflow-hidden opacity-0 pointer-events-none" : "h-full flex flex-col"}`}>
                <div className="p-3 flex flex-col h-full">
                  <div className="flex-shrink-0 flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-muzix-muted uppercase tracking-widest">
                      Now Playing {!isAdmin && videoId && <span className="text-muzix-purple">· synced</span>}
                    </span>
                  </div>
                  {videoId ? (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-black">
                        <div id="yt-player" className="w-full h-full" />
                      </div>
                      <div className="mt-2 flex items-center gap-2 flex-shrink-0">
                        <p className="flex-1 text-sm font-semibold text-white truncate min-w-0">{topSong?.title}</p>
                        <span className="flex-shrink-0 text-xs font-bold text-muzix-purple bg-muzix-purple/10 border border-muzix-purple/20 rounded-full px-2 py-0.5">▲ {topSong?.upvotes}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <span className="text-4xl mb-2 animate-float">🎵</span>
                      <p className="text-slate-500 text-sm">Queue is empty</p>
                      {isAdmin && <p className="text-xs text-slate-600 mt-1">Paste a YouTube URL above</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Queue — sidebar on desktop, hidden on mobile (accessible via bottom drawer) */}
            <div className="bg-muzix-card border border-white/8 rounded-2xl p-3 flex-col overflow-hidden flex-shrink-0 w-48 sm:w-56 lg:w-64 hidden sm:flex">
              <div className="flex-shrink-0 flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muzix-muted uppercase tracking-widest">Queue</span>
                <span className="text-[10px] text-muzix-muted">{songs.length}</span>
              </div>
              {songs.length === 0
                ? <div className="flex-1 flex flex-col items-center justify-center"><span className="text-2xl mb-1">🎶</span><p className="text-slate-500 text-xs">Empty</p></div>
                : <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">{songs.map((s,i) => <MemoSongCard key={s._id} item={s} rank={i+1} token={token} roomId={room_id} />)}</div>}
            </div>
          </div>

          {/* ── Bottom bar ───────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-white/8 bg-muzix-surface/40 px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">

              {/* Call controls */}
              {!inCall ? (
                <button onClick={joinCall}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white hover:brightness-110 transition-all flex-shrink-0"
                  style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                  <CamIcon /> Call
                </button>
              ) : (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <IconBtn active={micOn}     onClick={toggleMic}                  title={micOn    ?"Mute":"Unmute"}><MicOrOff on={micOn} /></IconBtn>
                  <IconBtn active={camOn}     onClick={toggleCam}                  title={camOn    ?"Cam off":"Cam on"}><CamOrOff on={camOn} /></IconBtn>
                  <IconBtn active={!deafened} onClick={() => setDeafened(d=>!d)}   title={deafened ?"Undeafen":"Deafen"}><SpkOrOff on={!deafened} /></IconBtn>
                  <button onClick={leaveCall} className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all flex-shrink-0">
                    <HangupIcon /> End
                  </button>
                </div>
              )}

              {/* Video tiles strip */}
              {inCall && (
                <div className="flex items-center gap-1 overflow-x-auto max-w-[35vw] flex-shrink-0">
                  {localStream && (
                    <div onClick={() => pinStage('peer:self')} className="cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all flex-shrink-0">
                      <VideoTile stream={localStream} username={username} local reactions={reactions.filter(r => r.socketId === mySocketId)} />
                    </div>
                  )}
                  {peerList.slice(0,3).map(([id, { stream, username: pu }]) => (
                    <div key={id} onClick={() => pinStage(`peer:${id}`)} className="cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all flex-shrink-0">
                      <VideoTile stream={stream} username={pu} deafened={deafened} reactions={reactions.filter(r => r.socketId === id)} />
                    </div>
                  ))}
                  {peerList.length > 3 && (
                    <div className="flex-shrink-0 w-10 h-[4rem] rounded-xl bg-muzix-surface border border-white/10 flex items-center justify-center text-[10px] text-muzix-muted">
                      +{peerList.length - 3}
                    </div>
                  )}
                </div>
              )}

              {/* Emoji reaction button */}
              <div className="relative flex-shrink-0">
                <button onClick={() => setShowEmojiBar(e => !e)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-base">
                  😊
                </button>
                {showEmojiBar && (
                  <div className="absolute bottom-11 left-0 bg-muzix-card border border-white/10 rounded-2xl px-2 py-1.5 flex gap-1.5 shadow-2xl animate-pop-in z-20">
                    {REACTION_EMOJIS.map(e => (
                      <button key={e} onClick={() => sendReaction(e)}
                        className="text-xl hover:scale-125 transition-transform active:scale-95 select-none">
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Compact pomodoro chip */}
              {pomState && (
                <div className="flex-shrink-0 flex items-center gap-1.5 bg-white/5 border border-white/8 rounded-xl px-2.5 py-1.5 text-xs cursor-pointer hover:bg-white/8 transition-all" onClick={() => pinStage('pomodoro')}>
                  <span>{pomState.mode==='work'?'🍅':'☕'}</span>
                  <span className="font-mono font-bold text-white tabular-nums">{fmt(pomState.remaining ?? Math.max(0, pomState.duration - pomState.elapsed))}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${pomState.running ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
                </div>
              )}

              {/* Members + side panels — right */}
              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                <div className="flex items-center">
                  {members.slice(0,4).map(m => (
                    <div key={m.socketId} title={m.username}
                      className="-ml-1 first:ml-0 w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white border-2 border-muzix-bg"
                      style={{ background: avatarClr(m.username) }}>
                      {initials(m.username)}
                    </div>
                  ))}
                  {members.length > 4 && <span className="ml-1 text-[10px] text-muzix-muted">+{members.length-4}</span>}
                </div>
                {/* Mobile-only queue button */}
                <button onClick={() => setShowQueue(q => !q)} title="Queue"
                  className={`relative w-8 h-8 rounded-xl flex items-center justify-center border transition-all text-sm sm:hidden
                    ${showQueue?"bg-muzix-purple/20 border-muzix-purple/40":"bg-white/5 border-white/10 hover:bg-white/10"}`}>
                  🎵
                  {songs.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-muzix-purple rounded-full text-[8px] font-bold flex items-center justify-center">{songs.length}</span>}
                </button>
                <button onClick={() => toggleSide('tasks')} title="Tasks"
                  className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all text-sm sm:hidden
                    ${sidePanel==='tasks'?"bg-muzix-purple/20 border-muzix-purple/40":"bg-white/5 border-white/10 hover:bg-white/10"}`}>
                  ✅
                </button>
                <button onClick={() => toggleSide('chat')} className="relative w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm">
                  💬
                  {unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] font-bold flex items-center justify-center">{unread>9?"9+":unread}</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile queue drawer (sm:hidden) ─────────────────────────────────── */}
        {showQueue && (
          <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setShowQueue(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="absolute bottom-0 left-0 right-0 bg-muzix-card border-t border-white/10 rounded-t-2xl max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8">
                <div>
                  <span className="font-bold text-sm">Song Queue</span>
                  <span className="ml-2 text-[10px] text-muzix-muted">{songs.length} song{songs.length!==1?"s":""}</span>
                </div>
                <button onClick={() => setShowQueue(false)} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
              </div>
              {isAdmin && (
                <div className="flex-shrink-0 px-3 pt-2 pb-1">
                  <div className="flex gap-2">
                    <input value={link} placeholder="Paste YouTube URL…" onChange={e => setLink(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAddSong()}
                      className="flex-1 px-3 py-2 rounded-xl bg-muzix-surface border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-muzix-purple min-w-0" />
                    <button onClick={handleAddSong} disabled={adding || !link.trim()}
                      className="px-3 py-2 rounded-xl font-bold text-sm text-white disabled:opacity-40 flex-shrink-0"
                      style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                      {adding ? "…" : "+"}
                    </button>
                  </div>
                  {addError && <p className="mt-1 text-xs text-red-400">{addError}</p>}
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {songs.length === 0
                  ? <div className="flex flex-col items-center justify-center py-8"><span className="text-3xl mb-2">🎶</span><p className="text-slate-500 text-sm">No songs yet</p></div>
                  : songs.map((s,i) => <MemoSongCard key={s._id} item={s} rank={i+1} token={token} roomId={room_id} />)}
              </div>
            </div>
          </div>
        )}

        {/* ── Side panel ──────────────────────────────────────────────────────── */}
        <div className={`flex-shrink-0 flex flex-col border-l border-white/8 bg-muzix-surface transition-all duration-200 ${sidePanel ? "w-72 sm:w-80" : "w-0 overflow-hidden"}`}>
          {sidePanel && (
            <>
              <div className="flex-shrink-0 flex items-center border-b border-white/8">
                {['chat','tasks'].map(p => (
                  <button key={p} onClick={() => setSidePanel(p)}
                    className={`flex-1 text-xs font-semibold py-2.5 transition-all ${sidePanel===p?"text-white border-b-2 border-muzix-purple":"text-slate-500 hover:text-slate-300"}`}>
                    {p==='chat' ? `💬 Chat${unread>0&&sidePanel!=='chat'?` (${unread})`:''}` : `✅ Tasks (${tasks.length})`}
                  </button>
                ))}
                <button onClick={() => setSidePanel(null)} className="text-slate-500 hover:text-white text-lg px-3 leading-none">×</button>
              </div>

              {sidePanel === 'chat' && (
                <>
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                    {messages.length === 0 && <p className="text-xs text-muzix-muted text-center mt-4">No messages yet 👋</p>}
                    {messages.map(msg => (
                      <div key={msg.id} className={`flex gap-1.5 ${msg.userId===userId?"flex-row-reverse":""}`}>
                        <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white mt-0.5" style={{ background: avatarClr(msg.username) }}>{initials(msg.username)}</div>
                        <div className={`max-w-[180px] flex flex-col ${msg.userId===userId?"items-end":"items-start"}`}>
                          <span className="text-[9px] text-muzix-muted mb-0.5">{msg.userId===userId?"You":msg.username}</span>
                          <span className={`text-xs px-2.5 py-1.5 rounded-2xl break-words leading-relaxed ${msg.userId===userId?"bg-muzix-purple text-white rounded-br-sm":"bg-white/8 text-slate-200 rounded-bl-sm"}`}>{msg.text}</span>
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={sendChat} className="flex-shrink-0 px-2 py-2 border-t border-white/8 flex gap-1.5">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Message…" maxLength={500}
                      className="flex-1 bg-muzix-card border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-muzix-purple transition-all min-w-0" />
                    <button type="submit" disabled={!chatInput.trim()}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 hover:brightness-110 transition-all flex-shrink-0"
                      style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>↑</button>
                  </form>
                </>
              )}

              {sidePanel === 'tasks' && (
                <div className="flex-1 overflow-hidden flex flex-col p-3">
                  <div className="flex items-center justify-between mb-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold text-muzix-muted uppercase tracking-widest">Session Goals</span>
                    {isAdmin && <button onClick={() => socketRef.current?.emit('task:clear')} className="text-[10px] text-slate-600 hover:text-red-400 transition-colors">Clear</button>}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <TaskPanel tasks={tasks} socket={socketRef.current} isAdmin={isAdmin} roomId={room_id} token={token} currentUserId={userId} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function MicOrOff({ on }) {
  return on
    ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z"/></svg>
    : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>;
}
function CamOrOff({ on }) {
  return on
    ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
    : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21 6.5l-4-4-15 15 1.41 1.41L7 15.34V17a1 1 0 001 1h9.17l2 2L21 18.5 21 6.5zm-1 9.53L16.47 12.5 20 9v7.03zM4.83 5H16c.55 0 1 .45 1 1v.17l2-2V6a3 3 0 00-3-3H4.83L4.83 5z"/></svg>;
}
function SpkOrOff({ on }) {
  return on
    ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
    : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>;
}
function HangupIcon() {
  return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>;
}
function CamIcon() {
  return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>;
}
