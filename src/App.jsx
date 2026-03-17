import { useEffect, useRef, useState } from "react";
import "./App.css";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import logoMark from "./assets/webcam-sign-logo.svg";

const MODEL_URL = "/models/hand_landmarker.task";
const MEDIAPIPE_VERSION = "0.10.32";
const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const STROKE_WIDTH = 2;
const CANVAS_STROKE_COLOR = "#201a16";
const EXPORT_STROKE_COLOR = "black";
const CURSOR_RADIUS = 5;
const CURSOR_IDLE_COLOR = "#2f7a5f";
const CURSOR_DRAWING_COLOR = "#201a16";
const PINCH_ON_RATIO = 0.18;
const PINCH_OFF_RATIO = 0.24;
const PINCH_SMOOTHING = 0.45;
const PINCH_RELEASE_GRACE_FRAMES = 3;
const DRAWING_RELEASE_RATIO = 0.34;
const DRAWING_RELEASE_GRACE_FRAMES = 6;

const INTERACTION_COPY = {
  "loading-model": {
    eyebrow: "Preparing surface",
    title: "Loading hand tracking",
    detail:
      "Preparing the signing surface so you can write with a pinch gesture.",
  },
  "camera-off": {
    eyebrow: "",
    title: "Ready to sign?",
    detail: "",
  },
  "awaiting-hand": {
    eyebrow: "Camera is live",
    title: "Show one hand in frame",
    detail:
      "Keep your hand above the paper and make sure your thumb and index finger stay visible.",
  },
  "tracking-lost": {
    eyebrow: "Camera is live",
    title: "Tracking lost",
    detail:
      "Move your hand back into frame and pause over the guide line to continue signing.",
  },
  ready: {
    eyebrow: "Camera is live",
    title: "Ready to sign",
    detail:
      "Pinch your thumb and index finger together to start drawing on the signature line.",
  },
  drawing: {
    eyebrow: "Camera is live",
    title: "Signing in progress",
    detail: "Release your pinch to lift the ink, then pinch again to continue.",
  },
};

function App() {
  const handLandmarkerRef = useRef(null);
  const videoRef = useRef(null);
  const rafId = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const canvasRef = useRef(null);
  const isPinchingRef = useRef(false);
  const isDrawingRef = useRef(false);
  const handDetectedRef = useRef(false);
  const hasSignatureRef = useRef(false);
  const interactionPhaseRef = useRef("loading-model");
  const cursorPointRef = useRef(null);
  const smoothedPinchRatioRef = useRef(null);
  const pinchReleaseFramesRef = useRef(0);

  const [cameraOn, setCameraOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [interactionPhase, setInteractionPhase] = useState("loading-model");
  const [feedback, setFeedback] = useState(null);

  const strokesRef = useRef([]);
  const currentStrokeRef = useRef([]);

  const status = INTERACTION_COPY[interactionPhase];
  const showEmptyState = !cameraOn && !hasSignature;
  useEffect(() => {
    if (!feedback) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  function syncHandDetected(next) {
    handDetectedRef.current = next;
  }

  function syncHasSignature(next) {
    if (hasSignatureRef.current === next) return;

    hasSignatureRef.current = next;
    setHasSignature(next);
  }

  function updateHasSignature() {
    syncHasSignature(
      strokesRef.current.length > 0 || currentStrokeRef.current.length > 0,
    );
  }

  function syncInteractionPhase(next) {
    if (interactionPhaseRef.current === next) return;

    interactionPhaseRef.current = next;
    setInteractionPhase(next);
  }

  function showFeedback(section, message) {
    setFeedback({ section, message });
  }

  function finishCurrentStroke() {
    if (isDrawingRef.current && currentStrokeRef.current.length > 0) {
      strokesRef.current.push(currentStrokeRef.current);
    }

    currentStrokeRef.current = [];
    isDrawingRef.current = false;
    updateHasSignature();
  }

  function syncCanvasSize(canvas, video) {
    if (
      canvas.width === video.videoWidth &&
      canvas.height === video.videoHeight
    ) {
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

  function getLandmarkDistance2D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return Math.hypot(dx, dy);
  }

  function getPinchDistanceRatio(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const pinkyMcp = landmarks[17];

    const pinchDistance = getLandmarkDistance2D(thumbTip, indexTip);
    const palmWidth = getLandmarkDistance2D(indexMcp, pinkyMcp);
    const palmLength = getLandmarkDistance2D(wrist, middleMcp);
    const handScale = Math.max(palmWidth, palmLength, 0.0001);

    return pinchDistance / handScale;
  }

  function getSmoothedPinchRatio(nextRatio) {
    const previousRatio = smoothedPinchRatioRef.current;

    if (previousRatio == null) {
      smoothedPinchRatioRef.current = nextRatio;
      return nextRatio;
    }

    const smoothedRatio =
      previousRatio + (nextRatio - previousRatio) * PINCH_SMOOTHING;

    smoothedPinchRatioRef.current = smoothedRatio;
    return smoothedRatio;
  }

  function resetPinchSignal() {
    smoothedPinchRatioRef.current = null;
    pinchReleaseFramesRef.current = 0;
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
      return stroke
        .map((point, index) =>
          index === 0
            ? `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
            : `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
        )
        .join(" ");
    }

    const commands = [`M ${stroke[0].x.toFixed(2)} ${stroke[0].y.toFixed(2)}`];

    for (let i = 1; i < stroke.length - 1; i += 1) {
      const midPoint = getMidPoint(stroke[i], stroke[i + 1]);

      commands.push(
        `Q ${stroke[i].x.toFixed(2)} ${stroke[i].y.toFixed(2)} ${midPoint.x.toFixed(2)} ${midPoint.y.toFixed(2)}`,
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
    const hadHand = handDetectedRef.current;

    syncHandDetected(hasHand);

    if (!hasHand) {
      cursorPointRef.current = null;
      resetPinchSignal();
      isPinchingRef.current = false;
      finishCurrentStroke();
      syncInteractionPhase(hadHand ? "tracking-lost" : "awaiting-hand");
      redrawCanvas();
      return;
    }

    const lm = result.landmarks[0];
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const pinchRatio = getSmoothedPinchRatio(getPinchDistanceRatio(lm));
    // Once ink is down, be much slower to lift it so strokes survive weak angles.
    const releaseRatio = isDrawingRef.current
      ? DRAWING_RELEASE_RATIO
      : PINCH_OFF_RATIO;
    const releaseGraceFrames = isDrawingRef.current
      ? DRAWING_RELEASE_GRACE_FRAMES
      : PINCH_RELEASE_GRACE_FRAMES;

    if (!isPinchingRef.current && pinchRatio < PINCH_ON_RATIO) {
      pinchReleaseFramesRef.current = 0;
      isPinchingRef.current = true;
    }

    if (isPinchingRef.current && pinchRatio > releaseRatio) {
      pinchReleaseFramesRef.current += 1;

      if (pinchReleaseFramesRef.current >= releaseGraceFrames) {
        pinchReleaseFramesRef.current = 0;
        isPinchingRef.current = false;
      }
    } else {
      pinchReleaseFramesRef.current = 0;
    }

    const drawPoint = getDrawPoint(thumbTip, indexTip, canvas);
    cursorPointRef.current = drawPoint;

    if (!isPinchingRef.current) {
      finishCurrentStroke();
      syncInteractionPhase("ready");
      redrawCanvas();
      return;
    }

    syncInteractionPhase("drawing");

    if (!isDrawingRef.current) {
      isDrawingRef.current = true;
      currentStrokeRef.current = [drawPoint];
      updateHasSignature();
      redrawCanvas();
      return;
    }

    currentStrokeRef.current.push(drawPoint);
    updateHasSignature();
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
    isPinchingRef.current = false;
    resetPinchSignal();
    updateHasSignature();
    redrawCanvas();
  }

  useEffect(() => {
    async function init() {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
        numHands: 1,
      });

      handLandmarkerRef.current = handLandmarker;
      setModelReady(true);
      syncInteractionPhase("camera-off");
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = videoRef.current;

    video.srcObject = stream;
    await video.play();

    setCameraOn(true);
    setFeedback(null);
    syncInteractionPhase("awaiting-hand");
    startDetectionLoop();
  }

  function stopCamera() {
    stopDetectionLoop();
    syncHandDetected(false);
    cursorPointRef.current = null;
    isPinchingRef.current = false;
    resetPinchSignal();

    const video = videoRef.current;
    const stream = video?.srcObject;

    if (stream && stream.getTracks) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (video) video.srcObject = null;

    setCameraOn(false);
    syncInteractionPhase("camera-off");
    redrawCanvas();
  }

  function exportSignatureAsSVG() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const exportableStrokes =
      currentStrokeRef.current.length > 0
        ? [...strokesRef.current, currentStrokeRef.current]
        : strokesRef.current;

    if (exportableStrokes.length === 0) return;

    const width = canvas.width;
    const height = canvas.height;
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
    showFeedback("export", "Signature exported as SVG.");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={logoMark} alt="Webcam Sign logo" className="logo" />
          <div className="brandText">
            <div className="title">Webcam Sign</div>
          </div>
        </div>
        <div className="topbarMeta">Processed locally in your browser</div>
      </header>

      <main className="content">
        <section className="stage">
          <div className="signatureGuide">
            <div className="signatureGuideLabel">Sign here</div>
            <div className="signatureGuideLine" />
          </div>

          {showEmptyState ? (
            <div className="emptyState">
              <div className="emptyCard">
                {status.eyebrow ? (
                  <div className="emptyEyebrow">{status.eyebrow}</div>
                ) : null}
                <h2 className="emptyTitle">{status.title}</h2>
                {status.detail ? <p className="emptyBody">{status.detail}</p> : null}
                <ul className="emptySteps">
                  <li>Click Start Camera and allow camera access if prompted</li>
                  <li>Hold one hand in frame</li>
                  <li>Pinch your thumb and index finger together to start signing</li>
                  <li>Keep them pinched as you write</li>
                  <li>Release to stop</li>
                </ul>
              </div>
            </div>
          ) : null}

          <canvas ref={canvasRef} className="ink" />
        </section>

        <aside className="panel">
          <section className="panelSection">
            <div className="sectionHeader">
              <div className="sectionTitle">Live Preview</div>
            </div>

            <video
              ref={videoRef}
              muted
              playsInline
              className="cameraPreview"
              style={{ transform: "scaleX(-1)" }}
            />

            <div className="cameraMeta">
              The video feed stays on this page and is only used to track your
              hand
            </div>

            {!cameraOn ? (
              <button
                className="btn primary block"
                onClick={startCamera}
                disabled={!modelReady}
              >
                Start Camera
              </button>
            ) : (
              <button className="btn danger block" onClick={stopCamera}>
                Stop Camera
              </button>
            )}
            <button
              className="btn block"
              onClick={clearCanvas}
              disabled={!hasSignature}
            >
              Clear Canvas
            </button>
          </section>

          <section className="panelSection">
            <div className="sectionHeader">
              <div className="sectionTitle">Export</div>
              <div className="sectionText">
                Download a crisp SVG file of your signature when it looks right
              </div>
            </div>

            <button
              className="btn primary block"
              onClick={exportSignatureAsSVG}
              disabled={!hasSignature}
            >
              Download SVG
            </button>

            {feedback?.section === "export" ? (
              <div className="inlineNotice success">{feedback.message}</div>
            ) : null}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
