/* Import and connect socket.io */
let socket = io();


/* Data */

// WebRTC and p5 video capture related variables
let pcs = {}; // Store multiple peer connections indexed by socket ID

let localStream; // Local media stream for WebRTC

let pg;  // p5 Graphics Buffer (for erasing)
let mainVideo; // p5 Video object

// UI Button Functionality
let tool = { brush: "hard", size: 10, color: { r: 0, g: 0, b: 0, a: 255 }}; //Default tool + options

// Stroke data for socket communication
let currentStroke = null;
let strokes = {};

/* Setup Functions */
/* Initialize Socket.io, WebRTC, p5 canvas, and UI bindings */

function setup() {
  setupSocket(); //Sockets used for (1) Signaling WebRTC connections and (2) Canvas stroke communication
  setupCanvas();
  setupUIBindings();
}

function setupSocket() {
  //Listen for confirmation of connection
  socket.on('connect', () => console.log(`Connected: ${socket.id}`));

  setupStreamSignaling();
  setupUISignaling();
}

function setupStreamSignaling() {
  // Handle socket.io room events, used to establish WebRTC connections

  const setHeader = (text) => select('#roomT').html(text);

  // Client notified that they are hosting a room
  socket.on('roomHosted', roomCode => {
    setHeader('HOST');
    becomeHost(); // Set up host-specific WebRTC handling
  });

  // Client notified that they have joined a room as a guest
  socket.on('roomJoined', roomCode => {
    setHeader('GUEST');
    becomeGuest(); // Set up guest-specific WebRTC handling
  });
}

function becomeHost() {
  //Host sets up their local video stream when hosting a room
  //The const saves the promise returned by setupLocalStream() so we can await it later
  const streamReady = setupLocalStream(); 

  // Prepare to handle a new guest joining the room
  socket.on('guestJoined', async guestId => {
    console.log(`A new guest has joined: ${guestId}`);

    // Host creates a new peer connection (persisted in pcs) and adds stream for the guest - WebRTC
    const pc = createPeerConnection(guestId);
    
    await streamReady; // Wait for local stream to be ready before adding tracks - WebRTC
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Host creates an offer for the guest - WebRTC
    // Local description is a representation of the host's end of the connection - WebRTC
    let offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for gathering ICE (Interactive Connectivity Establishment) candidates before sending the offer - WebRTC
    await waitForIceGathering(pc);
    offer = pc.localDescription; // Update offer with the final local description after ICE gathering - WebRTC

    // Host offers connection to the guest via the signaling server - WebRTC
    socket.emit('hostOffer', {to: guestId, offer});
  });

  // Prepare to handle guest answers to offer - WebRTC
  socket.on('guestAnswer', async ({from, answer}) => {
    const pc = pcs[from]; //Retrieve the right pc for a given guest from persisted pcs
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  });
}

function becomeGuest() {
  // Prepare to handle host offer to connect - WebRTC
  socket.on('hostOffer', async ({from, offer}) => {
    // Guest creates a new peer connection for the host and sets up event handlers
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(offer); // Remote description is a representation of the host's end of the connection - WebRTC

    // Guest creates an answer for the host's offer
    let answer = await pc.createAnswer();
    await pc.setLocalDescription(answer); // Local description is a representation of the guest's end of the connection - WebRTC

    // Wait for gathering ICE (Interactive Connectivity Establishment) candidates before sending the offer - WebRTC
    await waitForIceGathering(pc);
    answer = pc.localDescription; // Update answer with the final local description after ICE gathering - WebRTC

    // Guest sends the answer back to the host via the signaling server
    socket.emit('guestAnswer', {to: from, answer});
  });
}

// Create a new RTCPeerConnection for a given socket ID (host or guest) and set up event handlers
function createPeerConnection(remoteSocketId) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }] // Use Google's public STUN server for ICE candidate gathering - WebRTC
  });

  // Set up event handler for when remote tracks are added to the connection
  // This event is triggered when the remote peer adds a track to the connection
  pc.ontrack = event => {
    setupRemoteStreamFromEvent(event);
  };

  pcs[remoteSocketId] = pc; // Persist the peer connection for this remote socket ID
  return pc;
}

// Wait for ICE (Interactive Connectivity Establishment) gathering to complete for a given RTCPeerConnection
function waitForIceGathering(pc) { 
  return new Promise((resolve, reject) => {
    // Resolves immediately if iceGatheringState is already 'complete'
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }

    //TODO: Reject with an error if ICE gathering fails or takes too long

    // Otherwise attaches a listener and resolves when complete
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.onicegatheringstatechange = null;
        resolve();
      }
    };
  });
}

async function setupLocalStream() {
  // Use MediaStream API to get access to the user's camera
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });
  setupVideoSource(localStream);

  //Returns a promise because this function is async and may involve user media permission prompts
}

function setupRemoteStreamFromEvent(event) {
  setupVideoSource(event.streams[0]);
}

function setupVideoSource(stream) {
  // mainVideo represents the primary HTML video element displaying the stream
  if (mainVideo) mainVideo.remove();
  mainVideo = createVideo([]); // Create a new p5 video element for the main video stream
  mainVideo.elt.srcObject = stream; // Attach the media stream to the video element
  mainVideo.elt.muted = true; // Mute the video element to avoid feedback when playing local stream
  mainVideo.elt.play(); // Start playing the video stream
  mainVideo.hide(); // Hide the video element as it will be displayed on the canvas instead of directly in the DOM
}

function setupUISignaling() {
  // Client-side socket handlers receive updates from the server regarding canvas and drawing events 
  // from other clients

  // Elegant way to handle different stroke types using a lookup table
  // eg. if ("start") strokeHandlers["start"](stroke) would be called
  const strokeHandlers = { start: strokeStart, point: strokePoint, end: strokeEnd };
  socket.on('initCanvas', data =>
    data.forEach(stroke => strokeHandlers[stroke.type]?.(stroke))
  );

  socket.on('strokeStart', applyStrokeStart);
  socket.on('strokePoint', applyStrokePoint);
  socket.on('strokeEnd', applyStrokeEnd);
  socket.on('clearCanvas', applyClearCanvas);
}

function setupUIBindings() {
  // Setup HTML element bindings for user interactions

  // Select an element and attach a handler (which receives the element), skipping missing elements
  // LLM Usage (Iris): Used Copilot for this `bind` helper function to simplify event binding for UI elements. 
  // Removed a lot of duplicated code. Refer to previous commits for example of more complex code for the 
  // same functionality.
  const bind = (selector, event, handler) => {
    const element = select(selector);
    if (element) element[event](() => handler(element));
  };

  bind('#clearCanvas', 'mousePressed', clearCanvas);

  bind('#sizeSlider', 'input', el => { tool.size = el.value(); });
  bind('#opacitySlider', 'input', el => { tool.color.a = map(el.value(), 0, 100, 0, 255); });
  bind('#softB', 'mousePressed', () => { tool.brush = "soft"; });
  bind('#hardB', 'mousePressed', () => { tool.brush = "hard"; });
  bind('#eraseB', 'mousePressed', () => { tool.brush = "eraser"; });
  
  //LLM Usage (Iris): Used Copilot for this `selectAll` formulation to match Tiff's HTML structure
  selectAll('#colorPalette .color-btn[data-color]').forEach(button => {
    button.mousePressed(() => {
      const c = color(button.attribute('data-color')); // Build a p5 color object from the hex color string
      tool.color = { r: red(c), g: green(c), b: blue(c), a: tool.color.a }; // Extract RGB from the selected color and preserve alpha
    });
  });
}

function setupCanvas() {
  // Initialize p5 canvas to the same size regardless of display resolution
  // Responsive in CSS, but fixed size in p5 canvas for consistent drawing coordinates
  let w = 640;
  let h = 480;

  let canvas = createCanvas(w, h);
  canvas.parent('p5Canvas');

  pg = createGraphics(w, h);
}

/* p5 Draw and Mouse Functions */
function draw() {
  // Clear to draw the current video frame, then overlay the drawing layer
  background(220);
  displayVideo();
  image(pg, 0, 0);
}

function displayVideo() {
  if (!mainVideo) return;
  // Scale video to fit canvas while maintaining aspect ratio
  let scaleFactor = min(640 / mainVideo.width, 480 / mainVideo.height);
  
  let w = mainVideo.width * scaleFactor;
  let h = mainVideo.height * scaleFactor;

  let left = (640 - w) / 2;
  let top = (480 - h) / 2;

  if (mainVideo) {
    image(mainVideo, left, top, w, h);
  }
}

function mousePressed() {
  if (!currentStroke) strokeStart();

  strokePoint();
}

function mouseDragged() {
  if (!currentStroke) return;

  strokePoint();
}

function mouseReleased() {
  if (!currentStroke) return;

  strokeEnd();
}

/* Data Handling Functions for Strokes and Canvas */

function strokeStart() {
  currentStroke = { id: `${socket.id}-${Date.now()}`, ...tool, points: [] };

  applyStrokeStart(currentStroke); // Apply locally
  socket.emit('strokeStart', currentStroke); // Apply remotely
}

function strokePoint() {
  let currentPoint = { id: currentStroke.id, point: { x: mouseX, y: mouseY } };

  applyStrokePoint(currentPoint); // Apply locally
  socket.emit('strokePoint', currentPoint); // Apply remotely
}

function strokeEnd() {
  applyStrokeEnd(currentStroke); // Apply locally
  socket.emit('strokeEnd', currentStroke); // Apply remotely
  currentStroke = null;
}

function clearCanvas() {
  applyClearCanvas(); // Apply locally
  socket.emit('clearCanvas'); // Apply remotely
}


/* Stroke Application Functions for both locally and remotely initiated strokes */

function applyStrokeStart(data) {
  strokes[data.id] = data;
}

function applyStrokePoint(data) {
  const { x, y } = data.point;
  // Only update the drawing layer after MouseDragged interactions
  if (!strokes[data.id]) return;
  let s = strokes[data.id];

  if (!s.points) s.points = [];
  s.points.push({ x, y });

  /*  TODO: Interpolate points between previous and current mouse positions for smoother brush strokes

      distance = distance between previous and current
      spacing = brush diameter × 0.25
      steps = max(1, ceil(distance / spacing))

      for i from 1 through steps:
          t = i / steps
          x = previous.x + (current.x − previous.x) × t
          y = previous.y + (current.y − previous.y) × t
          draw your brush circle at (x, y)

      Caveat: Won't match curves, impacts opacity blending for soft brushes
      Even better: 
      - Implement a proper curve interpolation algorithm like Catmull-Rom splines to match the actual mouse path more closely.
      - Add temporary stroke layer for uniform opacity blending and smoother rendering of soft brushes.
    */

  if (s.brush == "hard") {
    pg.fill(s.color.r, s.color.g, s.color.b, s.color.a);
    pg.noStroke();
    pg.circle(x, y, s.size);
  }
  else if (s.brush == "soft") {
    pg.drawingContext.filter = `blur(${s.size * 0.3}px)`; // (Tiff) GEMINI help adding gaussian blur
    pg.fill(s.color.r, s.color.g, s.color.b, s.color.a);
    pg.noStroke();
    pg.circle(x, y, s.size);
    pg.drawingContext.filter = 'none';
  }
  else if (s.brush == "eraser") {
    pg.erase();
    pg.noStroke();
    pg.circle(x, y, s.size);
    pg.noErase(); // (Tiff) GEMINI: ALWAYS call noErase() immediately after so subsequent shapes draw normally 
  }
}


function applyStrokeEnd(data) {
  if (strokes[data.id]) {
    delete strokes[data.id];
  }
}

function applyClearCanvas() {
  pg.clear();
}