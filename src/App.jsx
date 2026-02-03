import { useEffect, useState, useRef } from 'react';
import './App.css'
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL = "/models/hand_landmarker.task";

function App() {

  const handLandmarkerRef = useRef(null);
  const videoRef = useRef(null);
  const rafId = useRef(null);
  const canvasRef = useRef(null);
  const isPinchingRef = useRef(false);
  const isDrawingRef = useRef(false);

  const [cameraOn , setCameraOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [handDetected, setHandDetected] = useState(false);

  const strokesRef = useRef([]);
  const currentStrokeRef = useRef([]);


  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokesRef.current = [];
    currentStrokeRef.current = [];
  }

  useEffect (()=> {
    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
      );

      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
        numHands: 1,
      });

      handLandmarkerRef.current = handLandmarker;
      console.log("HandLandmarker ready");
      setModelReady(true);
    }

    init();
  }, []);

  function startDetectionLoop() {
    let lastVideoTime = -1;

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const handLandmarker = handLandmarkerRef.current;

      if (!video || !canvas || !handLandmarker || video.readyState < 2) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        const result = handLandmarker.detectForVideo(
          video,
          performance.now()
        );

        const hasHand = result.landmarks.length > 0;
        setHandDetected(hasHand);

        if (!hasHand) {
          isPinchingRef.current = false;
          isDrawingRef.current = false;
          rafId.current = requestAnimationFrame(loop);
          return;
        }

        const lm = result.landmarks[0];
        const thumbTip = lm[4];
        const indexTip = lm[8];

        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const dist = Math.hypot(dx, dy);


        const PINCH_ON = 0.045;
        const PINCH_OFF = 0.06;

        if (!isPinchingRef.current && dist < PINCH_ON) isPinchingRef.current = true;
        if (isPinchingRef.current && dist > PINCH_OFF) isPinchingRef.current = false;

        const midX = ((thumbTip.x + indexTip.x) / 2) * canvas.width;
        const midY = ((thumbTip.y + indexTip.y) / 2) * canvas.height;

        const drawX = canvas.width - midX;
        const drawY = midY;

        const ctx = canvas.getContext("2d");

        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "white";

        if (isPinchingRef.current) {
          if (!isDrawingRef.current) {
            isDrawingRef.current = true;

            // NEW: start a new stroke
            currentStrokeRef.current = [{ x: drawX, y: drawY }];

            ctx.beginPath();
            ctx.moveTo(drawX, drawY);
          } else {
            // NEW: add point to current stroke
            currentStrokeRef.current.push({ x: drawX, y: drawY });

            ctx.lineTo(drawX, drawY);
            ctx.stroke();
          }
          } else {
          // NEW: finish stroke
          if (isDrawingRef.current && currentStrokeRef.current.length > 0) {
            strokesRef.current.push(currentStrokeRef.current);
            currentStrokeRef.current = [];
          }
          isDrawingRef.current = false;
        }
      }

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia( {video:true});
    const video = videoRef.current;

    video.srcObject = stream;
    await video.play();

    setCameraOn(true)
    startDetectionLoop();
  }

  function stopCamera() {

    if (currentStrokeRef.current.length > 0) {
    strokesRef.current.push(currentStrokeRef.current);
    currentStrokeRef.current = [];
    }

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    setHandDetected(false);

    isPinchingRef.current = false;
    isDrawingRef.current = false;

    const video = videoRef.current;
    const stream = video?.srcObject;

    if (stream && stream.getTracks) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (video) video.srcObject = null;
    setCameraOn(false);
  }

  function exportSignatureAsSVG() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;

    const paths = strokesRef.current.map(stroke => {
      return stroke.map((p, i) =>
          i === 0
            ? `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
            : `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
          ) .join(" ");
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${width} ${height}"
      width="${width}"
      height="${height}">
    ${paths.map(d =>
      `<path d="${d}"
        stroke="black"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round" />`
      ).join("\n")} </svg>`.trim();

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "signature.svg";
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            <div className="title">Draw your signature with your webcam</div>
            <div className="subtitle">Pinch to draw • Release to lift</div>
          </div>
        </div>

        <div className="actions">
          {!cameraOn ? (
            <button className="btn primary" onClick={startCamera} disabled={!modelReady}>
              Start
            </button>
          ) : (
            <button className="btn" onClick={stopCamera}>
              Stop
            </button>
          )}

          <button className="btn" onClick={clearCanvas} disabled={!cameraOn}>
            Clear
          </button>

          <button className="btn" onClick={exportSignatureAsSVG} disabled={!cameraOn}>
            Export SVG
          </button>

        </div>
      </header>

      <main className="content">
        <section className="stage">
          <div className="hud">
            <span className={`pill ${modelReady ? "ok" : ""}`}>
              Model {modelReady ? "Ready" : "Loading"}
            </span>
            <span className={`pill ${handDetected ? "ok" : ""}`}>
              Hand {handDetected ? "Detected" : "Not found"}
            </span>
          </div>


          <video
            ref={videoRef}
            muted
            playsInline
            className="pip"
            style={{ transform: "scaleX(-1)" }}
          />

        
          <canvas
            ref={canvasRef}
            className="ink"

          />
        </section>

        <aside className="panel">
          <div className="panelTitle">Controls</div>
          <div className="panelRow">
            <div className="label">Status</div>
            <div className="value">
              {modelReady ? "Model ready" : "Loading model…"} •{" "}
              {handDetected ? "Hand detected" : "No hand"}
            </div>
          </div>

          <div className="tips">
            <div className="tipTitle">Tips</div>
            <ul>
              <li>Use bright lighting for more stable tracking.</li>
              <li>Keep your hand within the camera frame.</li>
              <li>Pinch thumb + index to draw.</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App