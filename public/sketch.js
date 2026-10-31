/* #region Imports */

/* Import and connect socket.io */
let socket = io();

/* #endregion */

/* #region Data */
// Mouse Position, drawing state, and tool settings
let xpos;
let ypos;
let d = false;

// ADDED: Array to store multiple circle objects
let circles = [];

// Video capture object for p5
let capture;

// UI Button Functionality
let UI = {};
let tool = {type: "brush", size: 10, color: {r: 0, g: 0, b: 0}}; //Default tool + options

/* #endregion */ 

/* #region Setup Functions */
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
}

function setupVideo() {
  // Initialize video capture
  capture = createCapture(VIDEO, { flipped: true });
  capture.hide();
}

function setupUI() {
  // Clear
  UI.clearButton = select('#clearCanvas');
  if (UI.clearButton) {
    UI.clearButton.mousePressed(clearCanvas);
  }

  // Sliders
  UI.sizeSlider = select('#sizeSlider');
  if (UI.sizeSlider) {
    UI.sizeSlider.input(() => setBrushSize(UI.sizeSlider.value()));
  }

  UI.opacitySlider = select('#opacitySlider');
  if (UI.opacitySlider) {
    UI.opacitySlider.input(() => setBrushOpacity(UI.opacitySlider.value()));
  }

  // Colors
  UI.colorPalette = select('#colorPalette');
  if (UI.colorPalette) {
    //LLM Usage (Iris): Used Copilot for this `selectAll` formulation to match Tiff's HTML structure
    selectAll('#colorPalette .color-btn[data-color]').forEach(button => {
      button.mousePressed(() => {
        const c = color(button.attribute('data-color')); // Build a p5 color object from the hex color string
        setBrushColor(red(c), green(c), blue(c)); // Set the brush color using the extracted RGB values
      });
    });
  }

  // Brushes
  UI.softBrushButton = select('#softB');
  if (UI.softBrushButton) {
    UI.softBrushButton.mousePressed(() => setToolType("soft"));
  }

  UI.hardBrushButton = select('#hardB');
  if (UI.hardBrushButton) {
    UI.hardBrushButton.mousePressed(() => setToolType("hard"));
  }
  
  UI.eraserButton = select('#eraseB');
  if (UI.eraserButton) {
    UI.eraserButton.mousePressed(() => setToolType("eraser"));
  }
}

function setupSocket() {
  //Listen for confirmation of connection
  socket.on('connect', function () {
    console.log("Connected");
  });

  //Listen for messages named 'data' from the server
  // socket.on('data', function (obj) {
  //   console.log(obj);
  //   drawPos(obj);
  // });
}
/* #endregion */

/* #region Tool and Brush Settings */

//Type of brush is a string eg. "hard", "soft", "eraser"
function setToolType(type) {
  tool.type = type;
  if (type == "soft"){
    tool.softness = 0.5; // Example value for soft brush
  }

  if (type == "hard"){
    tool.softness = 0; // Example value for hard brush
  }

  if (type == "eraser"){
    tool.softness = 1; // Example value for eraser
  }
}

//RGB color for brush 0-255 for each channel
function setBrushColor(r, g, b) {
  //set locally for p5
  tool.color = {r, g, b};
  //send via socket to server
  // socket.emit('data', { r, g, b });
}

function setBrushSize(size) {
  tool.size = size;
}

function setBrushOpacity(opacity) {
  tool.opacity = opacity;
}

function clearCanvas() {
  circles = [];
}
/* #endregion */

/* #region Draw and Mouse Functions */
function draw() {
  background(220);
  image(capture, 0, 0);

  // CHANGED: Replaced the single circle check with a loop that renders every circle in the array
  for (let c of circles) {
    fill(c.r, c.g, c.b);
    noStroke();
    circle(c.x, c.y, c.size);
  }
}

function mousePressed() {
  d = true;

  r = tool.color.r;
  g = tool.color.g;
  b = tool.color.b;
  size = tool.size;

  xpos = mouseX;
  ypos = mouseY;

  // ADDED: Pushes the newly created properties into the circles array each time you click
  circles.push({
    x: xpos,
    y: ypos,
    r: r,
    g: g,
    b: b,
    size: size
  });
}

function mouseMoved() {
  //Grab mouse position
  let mousePos = { x: mouseX, y: mouseY };
  //Send mouse position object to the server
  socket.emit('data', mousePos);

  //Draw yourself? or Wait for server?
  // fill(0);
  // ellipse(mouseX, mouseY 10, 10);
}
/* #endregion */

