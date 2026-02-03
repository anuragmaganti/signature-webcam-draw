Handtrack Draw

Handtrack Draw is a gesture-based drawing app that lets users draw on a canvas using only their hand.
A pinch gesture (thumb + index finger) is interpreted as pen down / pen up in real time using webcam input.

What it does

- Tracks hand landmarks from a live webcam feed
- Detects a pinch gesture to start and stop drawing
- Draws directly onto an HTML canvas
- Allows clearing the canvas and exporting drawings as PNGs

How it works

- Each video frame is processed using MediaPipe Hands
- The distance between thumb tip (landmark 4) and index tip (landmark 8) is measured
- When the distance crosses a threshold, drawing starts or stops
- Drawing coordinates are mapped directly to the canvas using normalized landmarks

Technical highlights

- Uses requestAnimationFrame for frame-accurate processing
- Stores gesture state in refs to avoid unnecessary React re-renders
- Applies hysteresis thresholds to stabilize pinch detection
- Synchronizes canvas resolution with video resolution to avoid distortion

Tech stack

- React
- MediaPipe Tasks Vision
- HTML Canvas
- WebRTC (getUserMedia)

Built with Codex to explore real-time gesture input, performance-aware React patterns, and canvas rendering.