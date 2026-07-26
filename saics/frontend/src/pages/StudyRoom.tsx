import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { Mic, MicOff, PhoneOff, LogOut } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Spinner from "../components/Spinner";

interface PeerInfo {
  socketId: string;
  studentId: number;
  fullName: string;
}

interface RemotePeer extends PeerInfo {
  stream: MediaStream;
}

const SIGNALING_URL = "http://localhost:5000";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function StudyRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { student, logout } = useAuth();

  const [sessionTitle, setSessionTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        // 1. Load session details (title etc.)
        const sessionRes = await api.get(`/study-sessions/${id}`);
        if (cancelled) return;
        setSessionTitle(sessionRes.data.session.title);
        setJoinCode(sessionRes.data.session.join_code);

        // 2. Grab the mic.
        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = localStream;

        // 3. Connect to the signaling server.
        const token = localStorage.getItem("saics_token");
        const socket = io(SIGNALING_URL, { auth: { token } });
        socketRef.current = socket;

        socket.on("connect", () => {
          socket.emit("join-room", { sessionId: id, fullName: student?.fullName || "Student" });
          setConnecting(false);
        });

        // We're the newcomer — initiate an offer to each peer already here.
        socket.on("existing-peers", (peers: PeerInfo[]) => {
          peers.forEach((peer) => createPeerConnection(peer, true));
        });

        // Someone else just joined after us — wait for their offer, don't initiate.
        socket.on("peer-joined", (_peer: PeerInfo) => {
          // No action needed yet; connection is created lazily when their
          // offer arrives via the "signal" event below.
        });

        socket.on(
          "signal",
          async ({ from, data }: { from: string; data: any }) => {
            let pc = peerConnectionsRef.current.get(from);

            if (data.type === "offer") {
              if (!pc) {
                pc = createPeerConnection({ socketId: from, studentId: 0, fullName: "Peer" }, false);
              }
              await pc.setRemoteDescription(new RTCSessionDescription(data));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit("signal", { to: from, data: pc.localDescription });
            } else if (data.type === "answer") {
              if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data));
            } else if (data.candidate) {
              if (pc) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(data));
                } catch (e) {
                  console.error("Failed to add ICE candidate", e);
                }
              }
            }
          }
        );

        socket.on("peer-left", ({ socketId }: { socketId: string }) => {
          const pc = peerConnectionsRef.current.get(socketId);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(socketId);
          }
          setRemotePeers((prev) => prev.filter((p) => p.socketId !== socketId));
        });
      } catch (err) {
        console.error(err);
        setError(
          "Could not join the voice room. Make sure you've allowed microphone access."
        );
        setConnecting(false);
      }
    }

    function createPeerConnection(peer: PeerInfo, isInitiator: boolean): RTCPeerConnection {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current.set(peer.socketId, pc);

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("signal", { to: peer.socketId, data: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        setRemotePeers((prev) => {
          const already = prev.find((p) => p.socketId === peer.socketId);
          if (already) return prev;
          return [...prev, { ...peer, stream: event.streams[0] }];
        });
      };

      if (isInitiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            socketRef.current?.emit("signal", { to: peer.socketId, data: pc.localDescription });
          });
      }

      return pc;
    }

    setup();

    return () => {
      cancelled = true;
      socketRef.current?.emit("leave-room");
      socketRef.current?.disconnect();
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      api.post(`/study-sessions/${id}/leave`).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = muted; // if currently muted, enable; else disable
    });
    setMuted(!muted);
  }

  function handleLeaveRoom() {
    navigate("/study-sessions");
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-content">
        <header className="topbar">
          <div>
            <p className="greeting-eyebrow">Live session</p>
            <h1>{sessionTitle || "Study Room"}</h1>
            {joinCode && (
              <p className="room-code-tag">
                Invite code: <span className="mono">{joinCode}</span>
              </p>
            )}
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={15} />
            Log out
          </button>
        </header>

        {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

        {connecting ? (
          <Spinner label="Connecting to the room..." />
        ) : (
          <>
            <div className="room-participants">
              <div className="participant-tile you">
                <div className="avatar-circle" style={{ background: student?.avatarColor || "#0e6e66" }}>
                  {student?.fullName?.charAt(0) || "?"}
                </div>
                <p>{student?.fullName} (you)</p>
                {muted && <span className="muted-tag">Muted</span>}
              </div>

              {remotePeers.map((peer) => (
                <div key={peer.socketId} className="participant-tile">
                  <div className="avatar-circle">{peer.fullName.charAt(0)}</div>
                  <p>{peer.fullName}</p>
                  <audio
                    autoPlay
                    ref={(el) => {
                      if (el) el.srcObject = peer.stream;
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="room-controls">
              <button className="mute-btn" onClick={toggleMute}>
                {muted ? <MicOff size={16} /> : <Mic size={16} />}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button className="leave-btn" onClick={handleLeaveRoom}>
                <PhoneOff size={16} />
                Leave room
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
