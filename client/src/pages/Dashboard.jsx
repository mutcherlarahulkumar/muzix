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

// ── Sub-components ────────────────────────────────────────────────────────────

// Callback ref is the only reliable way to set srcObject — useEffect misses mounts
function VideoTile({ stream, username, local, deafened, large }) {
  const nodeRef = useRef(null);
  const setRef  = useCallback((node) => {
    nodeRef.current = node;
    if (node) { node.srcObject = stream ?? null; node.muted = !!(local || deafened); }
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps
  // React's `muted` prop doesn't update reactively — must be imperative
  useEffect(() => { if (nodeRef.current) nodeRef.current.muted = !!(local || deafened); }, [local, deafened]);
  return (
    <div className={`relative overflow-hidden rounded-xl bg-muzix-surface border border-white/10 flex-shrink-0 ${large ? "w-full h-full" : "w-28 h-[4.5rem]"}`}>
      <video ref={setRef} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
      <span className="absolute bottom-1 left-1.5 text-[9px] font-semibold text-white/90 truncate max-w-[100px]">
        {local ? "You" : username}
      </span>
    </div>
  );
}

// DOM audio element so autoplay works after user-gesture; new Audio() off-DOM is blocked by browsers
function AudioPlayer({ stream, muted }) {
  const nodeRef = useRef(null);
  const setRef  = useCallback((node) => { nodeRef.current = node; if (node) node.srcObject = stream ?? null; }, [stream]);
  useEffect(() => { if (nodeRef.current) nodeRef.current.muted = !!muted; }, [muted]);
  return <audio ref={setRef} autoPlay playsInline style={{ display: "none" }} />;
}

function IconBtn({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all active:scale-95 flex-shrink-0
        ${active ? "bg-white/8 border-white/10 text-white hover:bg-white/15" : "bg-red-500/15 border-red-500/25 text-red-400 hover:bg-red-500/25"}`}>
      {children}
    </button>
  );
}

// Memoised — only re-renders when its own props change, not when call state changes
const MemoSongCard = memo(SongCard);

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const room_id  = localStorage.getItem("roomid");
  const token    = localStorage.getItem("token");
  const userId   = localStorage.getItem("userId");
  const username = localStorage.getItem("username") || "Guest";

  const [songs,        setSongs]        = useState([]);
  const [roomDetails,  setRoomDetails]  = useState({});
  const [link,         setLink]         = useState("");
  const [adding,       setAdding]       = useState(false);
  const [addError,     setAddError]     = useState("");
  const [copied,       setCopied]       = useState(false);
  const [connected,    setConnected]    = useState(false);
  const [members,      setMembers]      = useState([]);
  const [chatOpen,     setChatOpen]     = useState(false);
  const [messages,     setMessages]     = useState([]);
  const [chatInput,    setChatInput]    = useState("");
  const [unread,       setUnread]       = useState(0);
  const [inCall,       setInCall]       = useState(false);
  const [micOn,        setMicOn]        = useState(true);
  const [camOn,        setCamOn]        = useState(true);
  const [deafened,     setDeafened]     = useState(false);
  const [localStream,  setLocalStream]  = useState(null);
  const [peers,        setPeers]        = useState({});
  const [spotlight,    setSpotlight]    = useState(null); // null | 'youtube' | 'self' | socketId

  // Refs — stable values needed inside socket/WebRTC callbacks
  const socketRef      = useRef(null);
  const playerRef      = useRef(null);
  const playerReadyRef = useRef(false);
  const isSyncingRef   = useRef(false);
  const isAdminRef     = useRef(false);
  const currentVidRef  = useRef(null);
  const peersRef       = useRef({});
  const localStreamRef = useRef(null);
  const chatOpenRef    = useRef(false); // needed in socket closure — state would be stale
  const songsRef       = useRef([]);    // needed in YT onStateChange closure
  const chatEndRef     = useRef(null);

  const isAdmin = roomDetails.admin?.toString() === userId;
  const topSong = songs[0];
  const videoId = topSong ? getVideoId(topSong.link) : null;
  const peerList = Object.entries(peers);

  // Keep refs in sync
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);
  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { if (!token) navigate("/signin"); if (!room_id) navigate("/home"); }, [navigate, token, room_id]);

  // ── Initial HTTP fetch ────────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    if (!token || !room_id) return;
    const h = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/api/user/rooms/${room_id}/songs`, { headers: h }).then(r => setSongs(r.data)).catch(console.error);
    axios.get(`${API}/api/user/rooms/${room_id}`,       { headers: h }).then(r => setRoomDetails(r.data)).catch(console.error);
  }, [room_id, token]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatOpen) { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); setUnread(0); }
  }, [messages, chatOpen]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const closePeer = useCallback((sid) => {
    peersRef.current[sid]?.pc?.close();
    delete peersRef.current[sid];
    setPeers(p => { const n = { ...p }; delete n[sid]; return n; });
  }, []);

  const makePeer = useCallback((sid, peerName) => {
    // Close any existing connection to this peer first (handles reconnects)
    if (peersRef.current[sid]?.pc) {
      try { peersRef.current[sid].pc.close(); } catch (_) {}
    }
    const pc = new RTCPeerConnection(STUN);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    pc.onicecandidate = (e) => { if (e.candidate) socketRef.current?.emit("webrtc:ice", { to: sid, candidate: e.candidate }); };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      setPeers(p => ({ ...p, [sid]: { stream, username: peerName } }));
      peersRef.current[sid] = { ...peersRef.current[sid], stream, username: peerName };
    };
    pc.onconnectionstatechange = () => {
      if (["disconnected","failed","closed"].includes(pc.connectionState)) closePeer(sid);
    };
    peersRef.current[sid] = { pc, username: peerName };
    return pc;
  }, [closePeer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !room_id || !userId) return;
    const socket = io(API, { auth: { token }, transports: ["websocket","polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:join", { roomId: room_id, userId, username });
    });
    socket.on("disconnect", () => setConnected(false));

    // Members — deduplicate by userId, not just socketId, to handle reconnects cleanly
    socket.on("room:members", (list) => setMembers(list));
    socket.on("room:user-joined", (u) =>
      setMembers(p => {
        const filtered = p.filter(m => m.userId !== u.userId); // remove any stale entry for same user
        return [...filtered, u];
      })
    );
    socket.on("room:user-left", ({ socketId }) =>
      setMembers(p => p.filter(m => m.socketId !== socketId))
    );

    // Song finished — remove it; React will re-derive videoId from new songs[0]
    socket.on("song:removed", ({ songId }) =>
      setSongs(p => p.filter(s => s._id !== songId))
    );

    // Songs — deduplicate by _id to guard against double-fires
    socket.on("song:added", (s) =>
      setSongs(p => p.some(x => x._id === s._id) ? p : [...p, s].sort((a,b) => b.upvotes - a.upvotes))
    );
    socket.on("song:upvoted", ({ songId, upvotes, voters }) =>
      setSongs(p => p.map(s => s._id === songId ? { ...s, upvotes, voters } : s).sort((a,b) => b.upvotes - a.upvotes))
    );

    // Chat — use ref for chatOpen to avoid stale closure
    socket.on("chat:history", setMessages);
    socket.on("chat:message", (msg) => {
      setMessages(p => [...p, msg]);
      if (!chatOpenRef.current) setUnread(u => u + 1);
    });

    // Playback sync
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
            playerRef.current.loadVideoById(videoId);
            setTimeout(() => { isSyncingRef.current = false; }, 2000);
          }
        } catch (_) {}
        return;
      }
      if (!document.getElementById("yt-player")) return;
      playerReadyRef.current = true;
      playerRef.current = new window.YT.Player("yt-player", {
        width: "100%", height: "100%", videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onStateChange: (ev) => {
            if (!isAdminRef.current || isSyncingRef.current) return;
            const s = ev.data;
            // 0 = ended → advance queue; 1 = playing, 2 = paused → sync playback
            if (s === 0) {
              const finishedId = songsRef.current[0]?._id;
              if (finishedId) socketRef.current?.emit("song:finished", { songId: finishedId, roomId: room_id });
            } else if (s === 1 || s === 2) {
              socketRef.current?.emit("playback:update", { videoId: currentVidRef.current, currentTime: playerRef.current.getCurrentTime(), playing: s === 1 });
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
  }, [videoId]);

  useEffect(() => () => {
    try { playerRef.current?.destroy(); } catch (_) {}
    playerRef.current = null; playerReadyRef.current = false;
  }, []);

  // ── Call handlers ─────────────────────────────────────────────────────────
  const joinCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setInCall(true);
      socketRef.current?.emit("webrtc:ready");
    } catch (err) {
      alert("Camera/mic access denied.\n" + (err.message || err));
    }
  };

  const leaveCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    Object.keys(peersRef.current).forEach(id => { try { peersRef.current[id]?.pc?.close(); } catch (_) {} });
    peersRef.current = {};
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
    } catch (err) {
      setAddError(err.response?.data?.message || "Failed to add song.");
    } finally { setAdding(false); }
  };

  const copyRoomId = () => { navigator.clipboard.writeText(room_id || ""); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  // ── Spotlight derived ─────────────────────────────────────────────────────
  const isYtThumb = inCall && spotlight && spotlight !== "youtube";
  const isYtStage = inCall && spotlight === "youtube";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-muzix-bg text-white flex flex-col overflow-hidden">

      {/* Hidden audio elements — must be in DOM for autoplay to work after user gesture */}
      {peerList.map(([id, { stream }]) => <AudioPlayer key={id} stream={stream} muted={deafened} />)}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-white/8 bg-muzix-bg/95 backdrop-blur-xl z-30">
        <div className="max-w-[1600px] mx-auto px-4 h-12 flex items-center gap-3">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? "bg-green-400" : "bg-red-400 animate-pulse"}`} />
          <h1 className="font-black text-sm truncate flex-1" style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            {roomDetails.roomName || "…"}
          </h1>
          {isAdmin && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0" style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>Admin</span>}
          <button onClick={copyRoomId} title="Copy room ID" className="flex items-center gap-1 text-[11px] bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 hover:bg-white/10 transition-all flex-shrink-0">
            <span className="font-mono text-muzix-cyan max-w-[70px] truncate hidden sm:block">{room_id}</span>
            <span className="text-muzix-muted">{copied ? "✓" : "⎘"}</span>
          </button>
          <button onClick={() => navigate("/home")} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">← Leave</button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden max-w-[1600px] w-full mx-auto">

        {/* ── Main ──────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Admin add-song bar */}
          {isAdmin && (
            <div className="flex-shrink-0 px-4 pt-3">
              <div className="flex gap-2">
                <input type="text" value={link} placeholder="Paste a YouTube URL…"
                  className="flex-1 px-3 py-2 rounded-xl bg-muzix-card border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-muzix-purple focus:ring-1 focus:ring-muzix-purple/40 transition-all"
                  onChange={e => setLink(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddSong()} />
                <button onClick={handleAddSong} disabled={adding || !link.trim()}
                  className="px-4 py-2 rounded-xl font-bold text-sm text-white disabled:opacity-40 hover:brightness-110 transition-all whitespace-nowrap"
                  style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                  {adding ? "Adding…" : "+ Add"}
                </button>
              </div>
              {addError && <p className="mt-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1">{addError}</p>}
            </div>
          )}

          {/* ── Player + Queue grid ──────────────────────────────────────── */}
          <div className="flex-1 flex gap-3 p-4 overflow-hidden min-h-0">

            {/* Left: player / stage */}
            <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">

              {/* Pinned peer stage */}
              {inCall && spotlight && spotlight !== "youtube" && (
                <div className="flex-1 min-h-0 relative rounded-2xl overflow-hidden bg-black border border-white/8">
                  {spotlight === "self" && localStream && <VideoTile stream={localStream} username={username} local large />}
                  {spotlight !== "self" && peers[spotlight] && <VideoTile stream={peers[spotlight].stream} username={peers[spotlight].username} deafened={deafened} large />}
                  <button onClick={() => setSpotlight(null)}
                    className="absolute top-2 right-2 z-10 bg-black/70 border border-white/20 rounded-lg px-2 py-1 text-xs text-white hover:bg-black/90 transition-all">
                    ✕ Unpin
                  </button>
                  <div className="absolute top-2 left-2 z-10 bg-black/50 rounded-md px-1.5 py-0.5 text-[10px] text-white/70">
                    📌 {spotlight === "self" ? "You" : peers[spotlight]?.username}
                  </div>
                </div>
              )}

              {/* YouTube player — always at same DOM position; size changes via CSS only */}
              <div className={`relative rounded-2xl overflow-hidden bg-muzix-card border border-white/8 transition-all duration-200
                ${isYtThumb ? "flex-shrink-0 h-16 cursor-pointer hover:border-muzix-purple/40" : "flex flex-col"}
                ${isYtStage ? "flex-1 min-h-0" : ""}
              `}>
                {/* Thumb overlay — sits above the hidden player div */}
                {isYtThumb && (
                  <div className="absolute inset-0 z-10 flex items-center gap-2 px-3 bg-muzix-card" onClick={() => setSpotlight("youtube")}>
                    {topSong?.thumburl
                      ? <img src={topSong.thumburl} className="w-12 h-9 object-cover rounded-lg flex-shrink-0" alt="" />
                      : <div className="w-12 h-9 bg-muzix-surface rounded-lg flex items-center justify-center flex-shrink-0">🎵</div>}
                    <p className="text-xs font-medium text-white truncate flex-1">{topSong?.title || "No song"}</p>
                    <span className="text-[10px] text-muzix-purple flex-shrink-0">📌 Pin</span>
                  </div>
                )}

                {/* Full player — h-0 when thumb so #yt-player stays in DOM and keeps playing */}
                <div className={isYtThumb ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "p-3 flex flex-col h-full"}>
                  <div className="flex-shrink-0 flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-muzix-muted uppercase tracking-widest">
                      Now Playing {!isAdmin && videoId && <span className="text-muzix-purple">· synced</span>}
                    </span>
                    {inCall && videoId && !spotlight && (
                      <button onClick={() => setSpotlight("youtube")}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 hover:border-muzix-purple/40 text-muzix-muted hover:text-muzix-purple transition-all">
                        📌
                      </button>
                    )}
                    {isYtStage && (
                      <button onClick={() => setSpotlight(null)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-muzix-muted hover:text-white transition-all">
                        ✕
                      </button>
                    )}
                  </div>
                  {videoId ? (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className={`rounded-xl overflow-hidden bg-black ${isYtStage ? "flex-1 min-h-0" : "aspect-video w-full"}`}>
                        <div id="yt-player" className="w-full h-full" />
                      </div>
                      {!isYtStage && (
                        <div className="mt-2 flex items-center gap-2">
                          <p className="flex-1 text-sm font-semibold text-white truncate">{topSong?.title}</p>
                          <span className="flex-shrink-0 text-xs font-bold text-muzix-purple bg-muzix-purple/10 border border-muzix-purple/20 rounded-full px-2 py-0.5">▲ {topSong?.upvotes}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <span className="text-4xl mb-2 animate-float">🎵</span>
                      <p className="text-slate-500 text-sm">Queue is empty</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Thumbnail strip when pinned */}
              {inCall && spotlight && (
                <div className="flex-shrink-0 flex gap-2 overflow-x-auto pb-0.5">
                  {peerList.filter(([id]) => id !== spotlight).map(([id, { stream, username: pu }]) => (
                    <div key={id} onClick={() => setSpotlight(id)} title={pu}
                      className="cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all">
                      <VideoTile stream={stream} username={pu} deafened={deafened} />
                    </div>
                  ))}
                  {spotlight !== "self" && localStream && (
                    <div onClick={() => setSpotlight("self")} title="Pin yourself"
                      className="cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all">
                      <VideoTile stream={localStream} username={username} local />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Queue */}
            <div className={`bg-muzix-card border border-white/8 rounded-2xl p-3 flex flex-col overflow-hidden flex-shrink-0 ${inCall && spotlight ? "w-56" : "w-full lg:w-[45%]"}`}>
              <div className="flex-shrink-0 flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muzix-muted uppercase tracking-widest">Queue</span>
                <span className="text-[10px] text-muzix-muted">{songs.length} song{songs.length !== 1 ? "s" : ""}</span>
              </div>
              {songs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl mb-2">🎶</span>
                  <p className="text-slate-500 text-xs">Empty</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                  {songs.map((s, i) => <MemoSongCard key={s._id} item={s} rank={i + 1} token={token} roomId={room_id} />)}
                </div>
              )}
            </div>
          </div>

          {/* ── Bottom bar ──────────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-white/8 bg-muzix-surface/40 px-3 py-2">
            <div className="flex items-center gap-2">

              {!inCall ? (
                <button onClick={joinCall}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white hover:brightness-110 transition-all flex-shrink-0"
                  style={{ background:"linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                  <CamIcon /> Join Call
                </button>
              ) : (
                <>
                  {/* Call controls — always visible, left side */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <IconBtn active={micOn}     onClick={toggleMic}                    title={micOn    ? "Mute mic"  : "Unmute mic"}><MicOrOff on={micOn} /></IconBtn>
                    <IconBtn active={camOn}     onClick={toggleCam}                    title={camOn    ? "Cam off"  : "Cam on"}><CamOrOff on={camOn} /></IconBtn>
                    <IconBtn active={!deafened} onClick={() => setDeafened(d => !d)}   title={deafened ? "Undeafen" : "Deafen"}><SpkOrOff on={!deafened} /></IconBtn>
                    <button onClick={leaveCall} className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all flex-shrink-0">
                      <HangupIcon /> End
                    </button>
                  </div>

                  {/* Video tiles — scrollable horizontal strip, max 5 shown to save space */}
                  {!spotlight && (
                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-[min(50vw,360px)] flex-shrink-0">
                      {localStream && (
                        <div onClick={() => setSpotlight("self")} className="cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all flex-shrink-0">
                          <VideoTile stream={localStream} username={username} local />
                        </div>
                      )}
                      {peerList.slice(0, 4).map(([id, { stream, username: pu }]) => (
                        <div key={id} onClick={() => setSpotlight(id)} className="cursor-pointer rounded-xl ring-transparent hover:ring-2 ring-muzix-purple transition-all flex-shrink-0">
                          <VideoTile stream={stream} username={pu} deafened={deafened} />
                        </div>
                      ))}
                      {peerList.length > 4 && (
                        <div className="flex-shrink-0 w-12 h-[4.5rem] rounded-xl bg-muzix-surface border border-white/10 flex items-center justify-center text-xs text-muzix-muted">
                          +{peerList.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Members + chat — right side */}
              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                <div className="flex items-center">
                  {members.slice(0, 5).map(m => (
                    <div key={m.socketId} title={m.username}
                      className="-ml-1 first:ml-0 w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-muzix-bg"
                      style={{ background: avatarClr(m.username) }}>
                      {initials(m.username)}
                    </div>
                  ))}
                  {members.length > 5 && <span className="ml-1.5 text-[10px] text-muzix-muted">+{members.length - 5}</span>}
                </div>
                <span className="text-[10px] text-muzix-muted">{members.length} online</span>
                <button onClick={() => { setChatOpen(o => !o); setUnread(0); }}
                  className="relative w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm ml-1">
                  💬
                  {unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] font-bold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Chat panel ──────────────────────────────────────────────── */}
        <div className={`flex-shrink-0 flex flex-col border-l border-white/8 bg-muzix-surface transition-all duration-200 ${chatOpen ? "w-68" : "w-0 overflow-hidden"}`}>
          {chatOpen && (
            <>
              <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-white/8">
                <span className="font-bold text-sm">Chat</span>
                <button onClick={() => setChatOpen(false)} className="text-muzix-muted hover:text-white text-xl leading-none">×</button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {messages.length === 0 && <p className="text-xs text-muzix-muted text-center mt-4">No messages yet 👋</p>}
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-1.5 ${msg.userId === userId ? "flex-row-reverse" : ""}`}>
                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white mt-0.5"
                      style={{ background: avatarClr(msg.username) }}>
                      {initials(msg.username)}
                    </div>
                    <div className={`max-w-[170px] flex flex-col ${msg.userId === userId ? "items-end" : "items-start"}`}>
                      <span className="text-[9px] text-muzix-muted mb-0.5">{msg.userId === userId ? "You" : msg.username}</span>
                      <span className={`text-xs px-2.5 py-1.5 rounded-2xl break-words leading-relaxed
                        ${msg.userId === userId ? "bg-muzix-purple text-white rounded-br-sm" : "bg-white/8 text-slate-200 rounded-bl-sm"}`}>
                        {msg.text}
                      </span>
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
