import { useEffect, useRef } from 'react';
import './App.css'
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL = "/models/hand_landmarker.task";

function App() {

  const handLandmarkerRef = useRef(null);

  useEffect(()=> {
    async function init() {

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    const handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "VIDEO",
      numHands: 1,
    });

    handLandmarkerRef.current = handLandmarker;
    console.log("HandLandmarker ready");

    }

    init();

  }, []);

  return <h1>Pinch Pop</h1>

}


export default App
