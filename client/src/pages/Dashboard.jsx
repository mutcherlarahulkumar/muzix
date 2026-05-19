import axios from "axios";
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import SongCard from "../components/SongCard";
import { API } from "../config";

const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

const getVideoId = (url) => {
  const m = url?.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  return m ? m[1] : null;
};

const initials = (name = "?") => name.slice(0, 2).toUpperCase();

const AVATAR_COLORS = ["#8b5cf6", "#ec4899", "#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#6366f1", "#f97316"];
const avatarColor = (str = "") => AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length];

// ── Video tile for a single participant ──────────────────────────────────────
function VideoTile({ stream, username, local, deafened, large }) {
  const vidRef = useRef(null);
  useEffect(() => {
    if (vidRef.current && stream) vidRef.current.srcObject = stream;
  }, [stream]);
  return (
    <div className={`relative flex-shrink-0 overflow-hidden bg-muzix-surface border border-white/10 rounded-xl ${large ? 'w-full h-full' : 'w-36 h-24'}`}>
      <video
        ref={vidRef}
        autoPlay
        playsInline
        muted={local || deafened}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <span className={`absolute bottom-2 left-2 font-semibold text-white/90 truncate ${large ? 'text-sm max-w-[200px]' : 'text-[10px] max-w-[120px]'}`}>
        {local ? "You" : username}
      </span>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const room_id = localStorage.getItem("roomid");
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const username = localStorage.getItem("username") || "Guest";

  // ── UI state ──────────────────────────────────────────────────────────────
  const [link, setLink] = useState("");
  const [songs, setSongs] = useState([]);
  const [roomDetails, setRoomDetails] = useState({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [copied, setCopied] = useState(false);

  // ── Real-time state ───────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState([]);

  // ── Chat state ────────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [unread, setUnread] = useState(0);
  const chatEndRef = useRef(null);

  // ── Voice/video call state ────────────────────────────────────────────────
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [peers, setPeers] = useState({}); // { socketId: { stream, username } }
  const [spotlight, setSpotlight] = useState(null); // null | 'youtube' | 'self' | socketId

  // ── Refs ──────────────────────────────────────────────────────────────────
  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const playerCreatedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const isAdminRef = useRef(false);
  const currentVidRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const remoteAudioRefs = useRef({}); // socketId → <audio> element

  // ── Derived ───────────────────────────────────────────────────────────────
  const isAdmin = roomDetails.admin?.toString() === userId;
  const topSong = songs[0];
  const videoId = topSong ? getVideoId(topSong.link) : null;

  // Keep isAdmin in ref for stable callbacks
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) navigate("/signin");
    if (!room_id) navigate("/home");
  }, [navigate, token, room_id]);

  // ── Initial HTTP fetch ────────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    if (!token || !room_id) return;
    const h = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/api/user/rooms/${room_id}/songs`, { headers: h }).then(r => setSongs(r.data)).catch(console.error);
    axios.get(`${API}/api/user/rooms/${room_id}`, { headers: h }).then(r => setRoomDetails(r.data)).catch(console.error);
  }, [room_id, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Chat scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnread(0);
    }
  }, [messages, chatOpen]);

  // ── WebRTC helpers ────────────────────────────────────────────────────────
  const closePeer = useCallback((socketId) => {
    peersRef.current[socketId]?.pc?.close();
    delete peersRef.current[socketId];
    setPeers(prev => { const n = { ...prev }; delete n[socketId]; return n; });
    // Remove audio element
    if (remoteAudioRefs.current[socketId]) {
      remoteAudioRefs.current[socketId].srcObject = null;
      delete remoteAudioRefs.current[socketId];
    }
  }, []);

  const createPeerConnection = useCallback((targetSocketId, targetUsername) => {
    const pc = new RTCPeerConnection(STUN);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('webrtc:ice', { to: targetSocketId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      // Pipe audio to a dedicated <audio> element (bypasses deafen via .muted)
      if (!remoteAudioRefs.current[targetSocketId]) {
        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = stream;
        audio.muted = deafened;
        remoteAudioRefs.current[targetSocketId] = audio;
      } else {
        remoteAudioRefs.current[targetSocketId].srcObject = stream;
      }
      setPeers(prev => ({ ...prev, [targetSocketId]: { stream, username: targetUsername } }));
      peersRef.current[targetSocketId] = { ...peersRef.current[targetSocketId], stream, username: targetUsername };
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) closePeer(targetSocketId);
    };

    peersRef.current[targetSocketId] = { pc, username: targetUsername };
    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closePeer]);

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !room_id || !userId) return;

    const socket = io(API, { auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:join", { roomId: room_id, userId, username });
    });
    socket.on("disconnect", () => setConnected(false));

    // Members
    socket.on("room:members", (m) => setMembers(m));
    socket.on("room:user-joined", (u) =>
      setMembers(prev => prev.some(m => m.socketId === u.socketId) ? prev : [...prev, u])
    );
    socket.on("room:user-left", ({ socketId }) =>
      setMembers(prev => prev.filter(m => m.socketId !== socketId))
    );

    // Songs (real-time — no refetch needed)
    socket.on("song:added", (song) => {
      setSongs(prev => [...prev, song].sort((a, b) => b.upvotes - a.upvotes));
    });
    socket.on("song:upvoted", ({ songId, upvotes, voters }) => {
      setSongs(prev =>
        prev.map(s => s._id === songId ? { ...s, upvotes, voters } : s)
           .sort((a, b) => b.upvotes - a.upvotes)
      );
    });

    // Chat
    socket.on("chat:history", (history) => setMessages(history));
    socket.on("chat:message", (msg) => {
      setMessages(prev => [...prev, msg]);
      setUnread(prev => (chatOpen ? 0 : prev + 1));
    });

    // Playback sync (non-admin receives)
    socket.on("playback:state", ({ videoId: vid, currentTime, playing, updatedAt }) => {
      if (isAdminRef.current) return;
      isSyncingRef.current = true;

      if (playerRef.current && vid && vid !== currentVidRef.current) {
        currentVidRef.current = vid;
        playerRef.current.loadVideoById(vid);
      }

      const elapsed = (Date.now() - updatedAt) / 1000;
      const syncTime = currentTime + elapsed;

      const apply = () => {
        if (!playerRef.current) return;
        playerRef.current.seekTo(syncTime, true);
        if (playing) playerRef.current.playVideo();
        else playerRef.current.pauseVideo();
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      };
      // Give the player a moment if it just loaded a new video
      setTimeout(apply, vid !== currentVidRef.current ? 1500 : 100);
    });

    // WebRTC
    socket.on("webrtc:user-ready", async ({ socketId, username: peerUser }) => {
      if (!localStreamRef.current) return;
      const pc = createPeerConnection(socketId, peerUser);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { to: socketId, offer });
    });

    socket.on("webrtc:offer", async ({ from, fromUser, offer }) => {
      if (!localStreamRef.current) return;
      const pc = createPeerConnection(from, fromUser?.username);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { to: from, answer });
    });

    socket.on("webrtc:answer", async ({ from, answer }) => {
      const peer = peersRef.current[from];
      if (peer?.pc) await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("webrtc:ice", async ({ from, candidate }) => {
      const peer = peersRef.current[from];
      if (peer?.pc) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
      }
    });

    socket.on("webrtc:hangup", ({ socketId }) => closePeer(socketId));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, room_id, userId, username]);

  // ── Deafen toggle (mute/unmute all remote audio) ──────────────────────────
  useEffect(() => {
    Object.values(remoteAudioRefs.current).forEach(el => { el.muted = deafened; });
  }, [deafened]);

  // ── YouTube IFrame API ────────────────────────────────────────────────────
  useEffect(() => {
    if (window.YT?.Player) return;
    if (document.getElementById("yt-api-script")) return;
    const tag = document.createElement("script");
    tag.id = "yt-api-script";
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      window._ytReady = true;
      window.dispatchEvent(new Event("yt-ready"));
    };
  }, []);

  useEffect(() => {
    if (!videoId) return;

    const init = () => {
      if (!window.YT?.Player) return;
      currentVidRef.current = videoId;

      if (playerCreatedRef.current && playerRef.current) {
        try {
          const currentId = playerRef.current.getVideoData?.()?.video_id;
          if (currentId !== videoId) {
            isSyncingRef.current = true;
            playerRef.current.loadVideoById(videoId);
            setTimeout(() => { isSyncingRef.current = false; }, 2000);
          }
        } catch (_) {}
        return;
      }

      const el = document.getElementById("yt-player");
      if (!el) return;

      playerCreatedRef.current = true;
      playerRef.current = new window.YT.Player("yt-player", {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onStateChange: (ev) => {
            if (!isAdminRef.current || isSyncingRef.current) return;
            const s = ev.data;
            if (s === 1 || s === 2) {
              socketRef.current?.emit("playback:update", {
                videoId: currentVidRef.current,
                currentTime: playerRef.current.getCurrentTime(),
                playing: s === 1,
              });
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      init();
    } else {
      window.addEventListener("yt-ready", init, { once: true });
      const t = setTimeout(() => { if (window.YT?.Player) init(); }, 1500);
      return () => { clearTimeout(t); window.removeEventListener("yt-ready", init); };
    }
  }, [videoId]);

  useEffect(() => {
    return () => {
      try { playerRef.current?.destroy(); } catch (_) {}
      playerRef.current = null;
      playerCreatedRef.current = false;
    };
  }, []);

  // ── Voice/video handlers ──────────────────────────────────────────────────
  const joinCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setInCall(true);
      setCamOn(true);
      setMicOn(true);
      socketRef.current?.emit("webrtc:ready");
    } catch (err) {
      alert("Could not access camera/microphone: " + (err.message || err));
    }
  };

  const leaveCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    Object.keys(peersRef.current).forEach(id => { peersRef.current[id]?.pc?.close(); });
    peersRef.current = {};
    Object.values(remoteAudioRefs.current).forEach(el => { el.srcObject = null; });
    remoteAudioRefs.current = {};
    setPeers({});
    socketRef.current?.emit("webrtc:hangup", {});
    setSpotlight(null);
    setInCall(false);
  };

  const toggleMic = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
  };

  const toggleCam = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  };

  const toggleDeafen = () => setDeafened(d => !d);

  // ── Song handlers ─────────────────────────────────────────────────────────
  const handleAddSong = async () => {
    if (!link.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      await axios.post(`${API}/api/user/rooms/${room_id}/songs`, { link }, { headers: { Authorization: `Bearer ${token}` } });
      setLink("");
    } catch (err) {
      setAddError(err.response?.data?.message || "Failed to add song.");
    } finally {
      setAdding(false);
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(room_id || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit("chat:message", { text: chatInput.trim() });
    setChatInput("");
  };

  const peerEntries = Object.entries(peers);
  const selfStream = localStreamRef.current;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-muzix-bg text-white flex flex-col overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-muzix-bg/90 backdrop-blur-xl border-b border-white/8 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Connection dot */}
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-green-400 shadow-[0_0_6px_#4ade80]" : "bg-red-400 animate-pulse"}`} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muzix-muted uppercase tracking-widest leading-none">Now in</p>
              <h1 className="text-lg font-black truncate" style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {roomDetails.roomName || "Loading…"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={copyRoomId} className="flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-all">
              <span className="text-muzix-muted hidden sm:block">ID:</span>
              <span className="font-mono text-muzix-cyan truncate max-w-[80px]">{room_id}</span>
              <span className="text-base">{copied ? "✓" : "⎘"}</span>
            </button>

            {isAdmin && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                Admin
              </span>
            )}

            <button onClick={() => navigate("/home")} className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2">
              ← Leave
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden max-w-[1600px] w-full mx-auto">

        {/* ── Left column: Player + Queue ────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── Admin add-song bar ────────────────────────────────────────── */}
          {isAdmin && (
            <div className="flex-shrink-0 px-4 pt-4">
              <div className="bg-muzix-card border border-white/8 rounded-2xl p-4">
                <div className="flex gap-2 flex-col sm:flex-row">
                  <input
                    type="text"
                    value={link}
                    placeholder="Paste a YouTube URL to add to the queue…"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-muzix-surface border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-muzix-purple focus:ring-1 focus:ring-muzix-purple/40 transition-all"
                    onChange={e => setLink(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddSong()}
                  />
                  <button
                    onClick={handleAddSong}
                    disabled={adding || !link.trim()}
                    className="px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap hover:brightness-110 transition-all"
                    style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
                  >
                    {adding ? "Adding…" : "+ Add Song"}
                  </button>
                </div>
                {addError && <p className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{addError}</p>}
              </div>
            </div>
          )}

          {/* ── Player + Queue ───────────────────────────────────────────────── */}
          <div className="flex-1 flex gap-4 p-4 overflow-hidden">

            {/* ── Left: Stage + YT player + thumbnail strip ──────────────── */}
            <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">

              {/* Spotlighted PEER (stage) */}
              {inCall && spotlight && spotlight !== 'youtube' && (
                <div className="flex-1 min-h-0 relative rounded-2xl overflow-hidden bg-black border border-white/8">
                  {spotlight === 'self' && selfStream &&
                    <VideoTile stream={selfStream} username={username} local large />}
                  {spotlight !== 'self' && peers[spotlight] &&
                    <VideoTile stream={peers[spotlight].stream} username={peers[spotlight].username} deafened={deafened} large />}
                  <button
                    onClick={() => setSpotlight(null)}
                    className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-black/70 hover:bg-black/90 border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white transition-all"
                  >✕ Unpin</button>
                  <div className="absolute top-3 left-3 z-10 bg-black/60 rounded-lg px-2 py-1 text-xs text-white/80">
                    📌 {spotlight === 'self' ? 'You' : peers[spotlight]?.username}
                  </div>
                </div>
              )}

              {/* YouTube player card — ALWAYS at same React tree position, size adapts via CSS */}
              {(() => {
                const isThumb = !!(inCall && spotlight && spotlight !== 'youtube');
                const isStage = !!(inCall && spotlight === 'youtube');
                return (
                  <div className={`relative rounded-2xl overflow-hidden bg-muzix-card border border-white/8 transition-all duration-300
                    ${isThumb ? 'flex-shrink-0 h-[72px] cursor-pointer hover:border-muzix-purple/40' : 'flex flex-col'}
                    ${isStage ? 'flex-1 min-h-0' : ''}
                  `}>
                    {/* Thumbnail overlay — covers the player visually when in thumb mode */}
                    {isThumb && (
                      <div
                        className="absolute inset-0 z-10 flex items-center gap-3 px-3 bg-muzix-card"
                        onClick={() => setSpotlight('youtube')}
                      >
                        {topSong?.thumburl
                          ? <img src={topSong.thumburl} className="w-16 h-11 object-cover rounded-lg flex-shrink-0" />
                          : <div className="w-16 h-11 bg-muzix-surface rounded-lg flex items-center justify-center text-lg flex-shrink-0">🎵</div>
                        }
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{topSong?.title || 'No song playing'}</p>
                          <p className="text-[10px] text-muzix-muted">Click to pin player</p>
                        </div>
                        <span className="text-muzix-purple text-sm flex-shrink-0">📌</span>
                      </div>
                    )}

                    {/* Full player content — hidden when thumbnail but always in DOM so YT API survives */}
                    <div className={`${isThumb ? 'opacity-0 pointer-events-none h-0 overflow-hidden' : 'p-4 flex flex-col h-full'}`}>
                      <div className="flex-shrink-0 flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-muzix-muted uppercase tracking-widest">
                          Now Playing
                          {!isAdmin && videoId && <span className="ml-2 text-muzix-purple">• synced</span>}
                        </p>
                        {inCall && videoId && !spotlight && (
                          <button
                            onClick={() => setSpotlight('youtube')}
                            className="text-[10px] bg-white/5 hover:bg-muzix-purple/20 border border-white/10 hover:border-muzix-purple/40 rounded-lg px-2 py-1 text-muzix-muted hover:text-muzix-purple transition-all"
                          >📌 Pin</button>
                        )}
                        {isStage && (
                          <button
                            onClick={() => setSpotlight(null)}
                            className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-xs text-muzix-muted hover:text-white transition-all"
                          >✕ Unpin</button>
                        )}
                      </div>

                      {videoId ? (
                        <div className="flex-1 flex flex-col min-h-0">
                          <div className={`rounded-xl overflow-hidden bg-black ${isStage ? 'flex-1 min-h-0' : 'aspect-video w-full'}`}>
                            <div id="yt-player" className="w-full h-full" />
                          </div>
                          {!isStage && (
                            <div className="mt-3 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{topSong?.title}</p>
                                <p className="text-xs text-muzix-muted mt-0.5">{isAdmin ? "You control playback for everyone" : "Synced to admin"}</p>
                              </div>
                              <span className="flex-shrink-0 text-xs font-bold text-muzix-purple bg-muzix-purple/10 border border-muzix-purple/20 rounded-full px-2.5 py-1">▲ {topSong?.upvotes}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                          <span className="text-6xl mb-3 animate-float">🎵</span>
                          <p className="text-slate-400 text-sm">No songs in the queue yet.</p>
                          {!isAdmin && <p className="text-muzix-muted text-xs mt-1">The admin will add songs to get started.</p>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Thumbnail strip — all non-spotlighted tiles when something is pinned */}
              {inCall && spotlight && (
                <div className="flex-shrink-0 flex gap-2 overflow-x-auto pb-1">
                  {peerEntries
                    .filter(([id]) => id !== spotlight)
                    .map(([id, { stream, username: peerName }]) => (
                      <div
                        key={id}
                        className="flex-shrink-0 cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all"
                        onClick={() => setSpotlight(id)}
                        title={`Pin ${peerName}`}
                      >
                        <VideoTile stream={stream} username={peerName} deafened={deafened} />
                      </div>
                    ))}
                  {spotlight !== 'self' && selfStream && (
                    <div
                      className="flex-shrink-0 cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all"
                      onClick={() => setSpotlight('self')}
                      title="Pin yourself"
                    >
                      <VideoTile stream={selfStream} username={username} local />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Right: Queue ────────────────────────────────────────────── */}
            <div className={`bg-muzix-card border border-white/8 rounded-2xl p-4 flex flex-col overflow-hidden flex-shrink-0 ${inCall && spotlight ? 'w-64 xl:w-72' : 'w-full lg:w-[48%]'}`}>
              <div className="flex-shrink-0 flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muzix-muted uppercase tracking-widest">Queue</p>
                <span className="text-xs text-muzix-muted">{songs.length} song{songs.length !== 1 ? "s" : ""}</span>
              </div>
              {songs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <span className="text-4xl mb-3">🎶</span>
                  <p className="text-slate-400 text-sm">Queue is empty.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {songs.map((s, i) => (
                    <SongCard key={s._id} item={s} rank={i + 1} token={token} roomId={room_id} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Voice/Video bar ────────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-white/8 bg-muzix-surface/50 px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">

              {!inCall ? (
                <button
                  onClick={joinCall}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" /></svg>
                  Join Voice &amp; Video
                </button>
              ) : (
                <>
                  {/* When not in spotlight, show small tiles inline in the bar */}
                  {!spotlight && (
                    <>
                      {selfStream && (
                        <div className="cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all" onClick={() => setSpotlight('self')}>
                          <VideoTile stream={selfStream} username={username} local />
                        </div>
                      )}
                      {peerEntries.map(([id, { stream, username: peerName }]) => (
                        <div key={id} className="cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all" onClick={() => setSpotlight(id)}>
                          <VideoTile stream={stream} username={peerName} deafened={deafened} />
                        </div>
                      ))}
                    </>
                  )}

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    <ControlBtn on={micOn} onLabel="🎙️" offLabel="🔇" onClick={toggleMic} tooltip={micOn ? "Mute mic" : "Unmute mic"} />
                    <ControlBtn on={camOn} onLabel="📷" offLabel="📷" onClick={toggleCam} tooltip={camOn ? "Turn off camera" : "Turn on camera"} offStyle />
                    <ControlBtn on={!deafened} onLabel="🔊" offLabel="🔕" onClick={toggleDeafen} tooltip={deafened ? "Undeafen" : "Deafen"} />
                    <button
                      onClick={leaveCall}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                      End
                    </button>
                  </div>
                </>
              )}

              {/* Members pill */}
              <div className="flex items-center gap-1.5 ml-auto">
                {members.slice(0, 5).map(m => (
                  <div
                    key={m.socketId}
                    title={m.username}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-muzix-bg"
                    style={{ background: avatarColor(m.username) }}
                  >
                    {initials(m.username)}
                  </div>
                ))}
                {members.length > 5 && <span className="text-xs text-muzix-muted">+{members.length - 5}</span>}
                <span className="text-xs text-muzix-muted ml-1">{members.length} online</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: Chat panel ────────────────────────────────────── */}
        <div className={`flex-shrink-0 flex flex-col border-l border-white/8 bg-muzix-surface transition-all duration-300 ${chatOpen ? "w-72 sm:w-80" : "w-0 overflow-hidden"}`}>
          {chatOpen && (
            <>
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8">
                <span className="font-bold text-sm">Room Chat</span>
                <button onClick={() => setChatOpen(false)} className="text-muzix-muted hover:text-white text-lg leading-none">×</button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {messages.length === 0 && (
                  <p className="text-xs text-muzix-muted text-center mt-6">No messages yet. Say hi! 👋</p>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-2 ${msg.userId === userId ? "flex-row-reverse" : ""}`}>
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: avatarColor(msg.username) }}
                    >
                      {initials(msg.username)}
                    </div>
                    <div className={`max-w-[200px] ${msg.userId === userId ? "items-end" : "items-start"} flex flex-col`}>
                      <span className="text-[10px] text-muzix-muted mb-0.5">{msg.userId === userId ? "You" : msg.username}</span>
                      <span className={`text-xs px-3 py-1.5 rounded-2xl break-words ${msg.userId === userId ? "bg-muzix-purple text-white rounded-br-sm" : "bg-white/8 text-slate-200 rounded-bl-sm"}`}>
                        {msg.text}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={sendChat} className="flex-shrink-0 px-3 py-2 border-t border-white/8 flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Message…"
                  maxLength={500}
                  className="flex-1 bg-muzix-card border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-muzix-purple transition-all"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 transition-all hover:brightness-110"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
                >
                  ↑
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* ── Floating chat toggle ──────────────────────────────────────────── */}
      {!chatOpen && (
        <button
          onClick={() => { setChatOpen(true); setUnread(0); }}
          className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-neon-purple text-white text-xl hover:scale-110 transition-transform"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
        >
          💬
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

// ── Small helper: control button ──────────────────────────────────────────────
function ControlBtn({ on, onLabel, offLabel, onClick, tooltip, offStyle }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-all hover:scale-105 ${
        on
          ? "bg-white/8 border-white/10 text-white"
          : offStyle
            ? "bg-white/5 border-white/10 text-slate-500"
            : "bg-red-500/20 border-red-500/30 text-red-400"
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}
