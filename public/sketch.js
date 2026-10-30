//Open and connect socket
let socket = io();

// p5 variables --tiff's attempt-----------------------
let capture;
let brush;
let o;
let r;
let g;
let b;
let size;

let xpos;
let ypos;

let d = false;

let clearButton;

// ADDED: Array to store multiple circle objects
let circles = [];
// p5 variables END --tiff's attempt-----------------------

//Listen for confirmation of connection
socket.on('connect', function () {
  console.log("Connected");
});

function setup() {
  // p5 setup code START -----------------------
  let w = windowWidth * 0.5;
  let h = windowHeight * 0.7;
  
  // FIX 1: Assign canvas variable so canvas.parent() works
  let canvas = createCanvas(w, h);
  canvas.parent('p5Canvas');
  
  capture = createCapture(VIDEO, { flipped: true });
  capture.hide();

  // FIX 2: Attach clear button here in setup() instead of inside draw()
  clearButton = select('#clearCanvas');
  if (clearButton) {
    clearButton.mousePressed(clearCircles);
  }
  // p5 setup code END -----------------------

  //Listen for messages named 'data' from the server
  socket.on('data', function (obj) {
    console.log(obj);
    drawPos(obj);
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

//Expects an object with a and y properties
function drawPos(pos) {
  fill(0);
  ellipse(pos.x, pos.y, 10, 10);
}


//RGB color for brush 0-255 for each channel
function setBrushColor(r, g, b) {
  //set locally for p5
  //send via socket to serve
}

function setBrushSize(size) {

}

function setBrushOpacity(opacity) {

}

//Type of brush is a string eg. "hard", "soft", "eraser"
function setBrushType(type) {

}

function clearCanvas() {

}

//p5 code START -----------------------
function draw() {
  background(220);
  image(capture, 0, 0);

  // CHANGED: Replaced the single circle check with a loop that renders every circle in the array
  for (let c of circles) {
    fill(c.r, c.g, c.b);
    noStroke();
    circle(c.x, c.y, c.size);
  }

  // clearButton = createButton("clear");
  // clearButton.position(10, 10);
  // clearButton.mousePressed(clearCircles);
}

function mousePressed() {
  d = true;
  //set random colour & size for now -- just wanted to make sure it works! Please delete or comment it out after this
  r = ceil(random(0, 255));
  g = ceil(random(0, 255));
  b = ceil(random(0, 255));
  size = ceil(random(0, 50));

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

function clearCircles() {
  circles = []; 
}
// p5 code END -----------------------