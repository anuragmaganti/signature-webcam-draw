import { useEffect, useState, useRef } from 'react';
import './App.css'
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL = "/models/hand_landmarker.task";

function App() {

  const handLandmarkerRef = useRef(null);
  const videoRef = useRef(null);
  const intervalRef = useRef(null);
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

  function startDetectionInterval() {
    const video = videoRef.current;
    const landmarker = handLandmarkerRef.current;

    return setInterval(() => {
      const result = landmarker.detectForVideo(video, performance.now());
      setHandDetected(result.landmarks.length > 0);
    }, 200);

  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia( {video:true});
    const video = videoRef.current;

    video.srcObject = stream;
    await video.play();

    setCameraOn(true)
    intervalRef.current = startDetectionInterval();
  }

  function stopCamera() {

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
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

      <canvas ref={canvasRef} style={{background: "gray", transform: "scaleX(-1)", width: "500px", height: "500px"}}></canvas>


    </div>
  )

}


export default App
