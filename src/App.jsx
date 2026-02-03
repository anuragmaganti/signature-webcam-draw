import { useEffect, useState, useRef } from 'react';
import './App.css'
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL = "/models/hand_landmarker.task";

function App() {

  const handLandmarkerRef = useRef(null);
  const videoRef = useRef(null);
  const rafId = useRef(null);
  const canvasRef = useRef(null);

  const [cameraOn , setCameraOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [handDetected, setHandDetected] = useState(false);


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
      const handLandmarker = handLandmarkerRef.current;

      if (!video || video.readyState < 2) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        const result = handLandmarker.detectForVideo(
          video,
          performance.now()
        );

        setHandDetected(result.landmarks.length > 0);
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

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
     rafId.current = null;
    }

    setHandDetected(false);

    const video = videoRef.current;
    const stream = video?.srcObject;

    if (stream && stream.getTracks) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (video) video.srcObject = null;
    setCameraOn(false);
  }

  return (
    <div>
      <video ref={videoRef} muted playsInline style={{background:"black", objectFit: "cover", transform: "scaleX(-1)"}}></video>
      <div>
      {!cameraOn ? (
          <button onClick={startCamera} disabled={!modelReady}>
            Start Camera
          </button>
        ) : (
          <button onClick={stopCamera}>Stop Camera</button>
        )}
        <span>Model: {modelReady ? "ready" : "loading"}</span>
        <br></br>
        <span>Hand: {handDetected ? "detected" : "no hand detected"}</span>
      </div>

      <canvas ref={canvasRef} style={{background: "gray", height: "100%", width: "100%", transform: "scaleX(-1)"}}></canvas>


    </div>
  )

}


export default App
