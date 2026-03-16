import { useEffect, useState, useRef } from 'react';
import './App.css'
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL = "/models/hand_landmarker.task";
const STROKE_WIDTH = 2;
const CANVAS_STROKE_COLOR = "white";
const EXPORT_STROKE_COLOR = "black";
const CURSOR_RADIUS = 5;
const CURSOR_IDLE_COLOR = "#6cff87";
const CURSOR_DRAWING_COLOR = "#ffffff";

function App() {

  const handLandmarkerRef = useRef(null);
  const videoRef = useRef(null);
  const rafId = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const canvasRef = useRef(null);
  const isPinchingRef = useRef(false);
  const isDrawingRef = useRef(false);
  const handDetectedRef = useRef(false);
  const cursorPointRef = useRef(null);

  const [cameraOn , setCameraOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [handDetected, setHandDetected] = useState(false);

  const strokesRef = useRef([]);
  const currentStrokeRef = useRef([]);

  function syncHandDetected(next) {
    if (handDetectedRef.current === next) return;

    handDetectedRef.current = next;
    setHandDetected(next);
  }

  function finishCurrentStroke() {
    if (isDrawingRef.current && currentStrokeRef.current.length > 0) {
      strokesRef.current.push(currentStrokeRef.current);
    }

    currentStrokeRef.current = [];
    isDrawingRef.current = false;
  }

  function syncCanvasSize(canvas, video) {
    if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) {
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    redrawCanvas();
  }

  function getDrawPoint(thumbTip, indexTip, canvas) {
    const midX = ((thumbTip.x + indexTip.x) / 2) * canvas.width;
    const midY = ((thumbTip.y + indexTip.y) / 2) * canvas.height;

    return {
      x: canvas.width - midX,
      y: midY,
    };
  }

  function getMidPoint(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  function drawStroke(ctx, stroke) {
    if (stroke.length === 0) return;

    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = CANVAS_STROKE_COLOR;
    ctx.fillStyle = CANVAS_STROKE_COLOR;

    if (stroke.length === 1) {
      const [point] = stroke;

      ctx.beginPath();
      ctx.arc(point.x, point.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);

    if (stroke.length === 2) {
      ctx.lineTo(stroke[1].x, stroke[1].y);
      ctx.stroke();
      return;
    }

    for (let i = 1; i < stroke.length - 1; i += 1) {
      const midPoint = getMidPoint(stroke[i], stroke[i + 1]);
      ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, midPoint.x, midPoint.y);
    }

    const lastPoint = stroke[stroke.length - 1];
    ctx.lineTo(lastPoint.x, lastPoint.y);
    ctx.stroke();
  }

  function drawCursor(ctx) {
    const point = cursorPointRef.current;
    if (!point || !handDetectedRef.current) return;

    const cursorColor = isPinchingRef.current
      ? CURSOR_DRAWING_COLOR
      : CURSOR_IDLE_COLOR;

    ctx.save();
    ctx.strokeStyle = cursorColor;
    ctx.fillStyle = cursorColor;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(point.x, point.y, CURSOR_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function redrawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }

    drawStroke(ctx, currentStrokeRef.current);
    drawCursor(ctx);
  }

  function getStrokePathData(stroke) {
    if (stroke.length === 0) return "";

    if (stroke.length === 1) {
      const [point] = stroke;
      return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }

    if (stroke.length === 2) {
      return stroke.map((point, index) =>
        index === 0
          ? `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
          : `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      ).join(" ");
    }

    const commands = [
      `M ${stroke[0].x.toFixed(2)} ${stroke[0].y.toFixed(2)}`,
    ];

    for (let i = 1; i < stroke.length - 1; i += 1) {
      const midPoint = getMidPoint(stroke[i], stroke[i + 1]);

      commands.push(
        `Q ${stroke[i].x.toFixed(2)} ${stroke[i].y.toFixed(2)} ${midPoint.x.toFixed(2)} ${midPoint.y.toFixed(2)}`
      );
    }

    const lastPoint = stroke[stroke.length - 1];
    commands.push(`L ${lastPoint.x.toFixed(2)} ${lastPoint.y.toFixed(2)}`);

    return commands.join(" ");
  }

  function buildStrokeSvg(stroke) {
    if (stroke.length === 0) return "";

    if (stroke.length === 1) {
      const [point] = stroke;

      return `<circle
        cx="${point.x.toFixed(2)}"
        cy="${point.y.toFixed(2)}"
        r="${(STROKE_WIDTH / 2).toFixed(2)}"
        fill="${EXPORT_STROKE_COLOR}" />`;
    }

    return `<path d="${getStrokePathData(stroke)}"
        stroke="${EXPORT_STROKE_COLOR}"
        stroke-width="${STROKE_WIDTH}"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round" />`;
  }

  function processVideoFrame(video, canvas, handLandmarker) {
    const result = handLandmarker.detectForVideo(video, performance.now());
    const hasHand = result.landmarks.length > 0;

    syncHandDetected(hasHand);

    if (!hasHand) {
      cursorPointRef.current = null;
      isPinchingRef.current = false;
      finishCurrentStroke();
      redrawCanvas();
      return;
    }

    const lm = result.landmarks[0];
    const thumbTip = lm[4];
    const indexTip = lm[8];

    const dist = Math.hypot(
      thumbTip.x - indexTip.x,
      thumbTip.y - indexTip.y,
    );

    const PINCH_ON = 0.045;
    const PINCH_OFF = 0.06;

    if (!isPinchingRef.current && dist < PINCH_ON) isPinchingRef.current = true;
    if (isPinchingRef.current && dist > PINCH_OFF) isPinchingRef.current = false;

    const drawPoint = getDrawPoint(thumbTip, indexTip, canvas);
    cursorPointRef.current = drawPoint;

    if (!isPinchingRef.current) {
      finishCurrentStroke();
      redrawCanvas();
      return;
    }

    if (!isDrawingRef.current) {
      isDrawingRef.current = true;
      currentStrokeRef.current = [drawPoint];
      redrawCanvas();
      return;
    }

    currentStrokeRef.current.push(drawPoint);
    redrawCanvas();
  }

  function stopDetectionLoop() {
    finishCurrentStroke();

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    lastVideoTimeRef.current = -1;
  }

  function clearCanvas() {
    strokesRef.current = [];
    currentStrokeRef.current = [];
    isDrawingRef.current = false;
    redrawCanvas();
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
    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const handLandmarker = handLandmarkerRef.current;

      if (!video || !canvas || !handLandmarker || video.readyState < 2) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      syncCanvasSize(canvas, video);

      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        processVideoFrame(video, canvas, handLandmarker);
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
    stopDetectionLoop();
    syncHandDetected(false);
    cursorPointRef.current = null;

    isPinchingRef.current = false;

    const video = videoRef.current;
    const stream = video?.srcObject;

    if (stream && stream.getTracks) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (video) video.srcObject = null;
    setCameraOn(false);
    redrawCanvas();
  }

  function exportSignatureAsSVG() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;

    const exportableStrokes = currentStrokeRef.current.length > 0
      ? [...strokesRef.current, currentStrokeRef.current]
      : strokesRef.current;

    const svgElements = exportableStrokes
      .map(buildStrokeSvg)
      .filter(Boolean)
      .join("\n");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${width} ${height}"
      width="${width}"
      height="${height}">
    ${svgElements}</svg>`.trim();

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
