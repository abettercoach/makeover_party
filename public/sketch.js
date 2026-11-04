/* Import and connect socket.io */
let socket = io();


/* Data */

// WebRTC and p5 video capture related variables
let pcs = {}; // Store multiple peer connections indexed by socket ID
let pendingCandidates = {}; // Store ICE candidates received before remote description is set

let localStream; // Local media stream for WebRTC

let pg;  // p5 Graphics Buffer (for erasing)
let mainVideo; // p5 Video object

// UI Button Functionality
let tool = { brush: "hard", size: 10, color: { r: 0, g: 0, b: 0, a: 255 }}; //Default tool + options

// Stroke data for socket communication
let currentStroke = null;
let remoteStrokes = [];

/* Setup Functions */
/* Initialize p5 canvas and sets up event listeners */

function setup() {
  setupSocket();
  setupCanvas();
  setupUIBindings();
}

function setupSocket() {
  //Listen for confirmation of connection
  socket.on('connect', () => console.log(`Connected: ${socket.id}`));

  setupRoomSocketHandlers();
  setupUISocketHandlers();
}

function setupRoomSocketHandlers() {
  const setHeader = (text) => select('#roomT').html(text);

  // Client notified that they are hosting a room
  socket.on('roomHosted', roomCode => {
    setHeader('HOST, Room Code: ' + roomCode);
    becomeHost();
  });

  // Client notified that they have joined a room as a guest
  socket.on('roomJoined', roomCode => {
    setHeader('GUEST, Room Code: ' + roomCode);
    becomeGuest();
  });

  // Handle incoming Interactive Connectivity Establishment (ICE) candidates from remote peers (both host and guest) - WebRTC signaling
  // (Iris) I understand everything else about WebRTC signaling, but not this part.
  socket.on('iceCandidate', async ({from, candidate}) => {
    const pc = pcs[from];
    if (pc && pc.remoteDescription) {
      await pc.addIceCandidate(candidate);
    } else {
      if (!pendingCandidates[from]) pendingCandidates[from] = [];
      pendingCandidates[from].push(candidate);
    }
  });
}

function becomeHost() {
  //Host sets up their local video stream when hosting a room
  const streamReady =setupLocalStream(); 

  // Host notified that a new guest has joined the room
  socket.on('guestJoined', async guestId => {
    console.log(`A new guest has joined: ${guestId}`);

    // Host creates a new peer connection (persisted in pcs) and adds stream for the guest
    const pc = createPeerConnection(guestId);
    
    await streamReady;
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Host creates an offer for the guest
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Host sends the offer to the guest via the signaling server
    socket.emit('hostOffer', {to: guestId, offer});
  });

  // Host receives an acceptance from a guest
  socket.on('guestAnswer', async ({from, answer}) => {
    const pc = pcs[from]; //Retrieve the right pc for a given guest from persisted pcs
    if (pc) {
      await pc.setRemoteDescription(answer);
      await flushPendingCandidates(from);
    }
  });
}

function becomeGuest() {
  // Guest receives an offer from the host
  socket.on('hostOffer', async ({from, offer}) => {
    // Guest creates a new peer connection for the host and sets up event handlers
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(offer);
    await flushPendingCandidates(from);

    // Guest creates an answer for the host's offer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Guest sends the answer back to the host via the signaling server
    socket.emit('guestAnswer', {to: from, answer});
  });
}

// Create a new RTCPeerConnection for a given socket ID (host or guest) and set up event handlers
function createPeerConnection(remoteSocketId) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('iceCandidate', {to: remoteSocketId, candidate: event.candidate});
    }
  };

  pc.ontrack = event => {
    setupRemoteStreamFromEvent(event);
  };

  pcs[remoteSocketId] = pc;
  return pc;
}

// WebRTC
// Flush any pending ICE candidates for a given remote socket ID once the remote description is set
// From Co-Pilot suggestion (Iris)
async function flushPendingCandidates(remoteSocketId) {
  const pc = pcs[remoteSocketId];
  if (pc && pendingCandidates[remoteSocketId]) {
    for (const candidate of pendingCandidates[remoteSocketId]) {
      await pc.addIceCandidate(candidate);
    }
    delete pendingCandidates[remoteSocketId];
  }
}

async function setupLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });
  setupVideoSource(localStream);
}

function setupRemoteStreamFromEvent(event) {
  setupVideoSource(event.streams[0]);
}

function setupVideoSource(stream) {
  if (mainVideo) mainVideo.remove();
  mainVideo = createVideo([]);
  mainVideo.elt.srcObject = stream;
  mainVideo.elt.muted = true;
  mainVideo.elt.play();
  mainVideo.hide();
}

function setupUISocketHandlers() {
  // Client-side socket handlers receive updates from the server regarding canvas and drawing events 
  // from other clients

  // Elegant way to handle different stroke types using a lookup table
  // eg. if ("start") strokeHandlers["start"](stroke) would be called
  const strokeHandlers = { start: strokeStart, point: strokePoint, end: strokeEnd };
  socket.on('initCanvas', data =>
    data.forEach(stroke => strokeHandlers[stroke.type]?.(stroke))
  );

  socket.on('strokeStart', strokeStart);
  socket.on('strokePoint', strokePoint);
  socket.on('strokeEnd', strokeEnd);
  socket.on('clearCanvas', clearCanvas);
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

  bind('#clearCanvas', 'mousePressed', () => {
    clearCanvas();
    socket.emit('clearCanvas');
  });

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

function mouseDragged() {
  if (!currentStroke) {
    let strokeData = { id: `${socket.id}-${Date.now()}`, ...tool };
    strokeStart(strokeData);
    socket.emit('strokeStart', strokeData);
  }

  let pointData = { id: currentStroke.id, point: { x: mouseX, y: mouseY } };
  strokePoint(pointData);
  socket.emit('strokePoint', pointData);
}

function mouseReleased() {
  strokeEnd(currentStroke);
  socket.emit('strokeEnd', currentStroke);
}

/* Data Handling Functions for Strokes and Canvas */
/* Used to handle both local and remote stroke data for uniformity*/

function strokeStart(data) {
  if (!currentStroke) currentStroke = data ;
}

function strokePoint(data) {
  const { x, y } = data.point;
  // Only update the drawing layer after MouseDragged interactions
  if (!currentStroke) return;
  let s = currentStroke;

  if (currentStroke.brush == "hard") {
    pg.fill(s.color.r, s.color.g, s.color.b, s.color.a);
    pg.noStroke();
    pg.circle(x, y, currentStroke.size);
  }
  else if (currentStroke.brush == "soft") {
    pg.drawingContext.filter = `blur(${currentStroke.size * 0.3}px)`; // (Tiff) GEMINI help adding gaussian blur
    pg.fill(s.color.r, s.color.g, s.color.b, s.color.a);
    pg.noStroke();
    pg.circle(x, y, currentStroke.size);
    pg.drawingContext.filter = 'none';
  }
  else if (currentStroke.brush == "eraser") {
    pg.erase();
    pg.noStroke();
    pg.circle(x, y, currentStroke.size);
    pg.noErase(); // (Tiff) GEMINI: ALWAYS call noErase() immediately after so subsequent shapes draw normally 
  }
}

function strokeEnd(data) {
  if (currentStroke) {
    currentStroke = null;
  }
}

function clearCanvas() {
  pg.clear();
}