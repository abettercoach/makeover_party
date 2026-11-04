/* Import and connect socket.io */
let socket = io();

/* Data */

let pg;  // p5 Graphics Buffer (for erasing)
let capture; // p5 Video capture object

// UI Button Functionality
let tool = { brush: "hard", size: 10, color: { r: 0, g: 0, b: 0, a: 255 }}; //Default tool + options

// Stroke data for socket communication
let currentStroke = null;
let remoteStrokes = [];

/* Setup Functions */
/* Initialize p5 canvas and sets up event listeners */

function setup() {
  setupCanvas();
  setupVideo();
  setupUI();
  setupSocket();
}

function setupCanvas() {
  // Initialize p5 canvas
  let w = windowWidth * 0.5;
  let h = windowHeight * 0.7;

  let canvas = createCanvas(w, h);
  canvas.parent('p5Canvas');

  pg = createGraphics(w, h);
}

function setupVideo() {
  // Initialize video capture
  capture = createCapture(VIDEO, { flipped: true });
  capture.hide();
}

function setupUI() {
  // Select an element and attach a handler (which receives the element), skipping missing elements
  // LLM Usage (Iris): Used Copilot for this `bind` helper function to simplify event binding for UI elements. 
  // Removed a lot of duplicated code. Refer to previous commits for example of more complex code for the same functionality.
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

function setupSocket() {
  //Listen for confirmation of connection
  socket.on('connect', () => console.log(`Connected: ${socket.id}`));

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

/* p5 Draw and Mouse Functions */
function draw() {
  // Clear to draw the current video frame, then overlay the drawing layer
  background(220);
  image(capture, 0, 0);
  image(pg, 0, 0);
}

function mouseDragged() {
  let strokeData = { id: `${socket.id}-${Date.now()}`, ...tool };
  strokeStart(strokeData);
  socket.emit('strokeStart', strokeData);

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