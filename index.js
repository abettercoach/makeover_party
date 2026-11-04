//Initialize the express 'app' object
let express = require('express');
let app = express();
app.use('/', express.static('public'));

//Initialize the actual HTTP server
let http = require('http');
let server = http.createServer(app);
let port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log("Server listening at port: " + port);
});

//Initialize socket.io
let io = require('socket.io');
io = new io.Server(server);

// Data
let strokes = []; // Store all strokes received from clients

//Listen for individual clients/users to connect
io.sockets.on('connection', socket => {
    console.log("We have a new client: " + socket.id);
    
    socket.emit('initCanvas', strokes); // Send all previous strokes to the newly connected client

    socket.on('strokeStart', data => {
        strokes.push({ type: "start", ...data }); // Store the received stroke start data
        socket.broadcast.emit('strokeStart', data); // Broadcast to all clients except the sender
    });

    socket.on('strokePoint', data => {
        strokes.push({ type: "point", ...data }); 
        socket.broadcast.emit('strokePoint', data); 
    });

    socket.on('strokeEnd', data => {
        strokes.push({ type: "end", ...data }); 
        socket.broadcast.emit('strokeEnd', data); 
    });

    socket.on('clearCanvas', () => {
        strokes = [];
        socket.broadcast.emit('clearCanvas');
    });

    socket.on('disconnect', () => {
        console.log("A client has disconnected: " + socket.id);
    });
});