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
let hostRoomCode = null; // Store the room code of the host room
let hostSocketId = null; // Store which client is currently the host

let strokes = []; // Store all strokes received from clients

//Listen for individual clients/users to connect
io.sockets.on('connection', socket => {
    console.log("We have a new client: " + socket.id);

    // Room hosting
    if (!hostRoomCode) {
        setupHost(socket);
    } else {
        setupGuest(socket);
    }

    setupWebRTC(socket);
    setupUI(socket);

    // 'disconnecting' fires before rooms are cleared, so the room still includes this socket here
    socket.on('disconnecting', () => {
        console.log("A client has disconnected: " + socket.id);

        if (socket.id === hostSocketId) {
            readjustHost();
        }
    });
});

function setupHost(socket) {
    console.log("New host!");
    hostRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    hostSocketId = socket.id;
    socket.join(hostRoomCode);
    socket.emit('roomHosted', hostRoomCode); // Notify the client that they are now the host
}

function setupGuest(socket) {
    console.log("New guest joining host room: " + hostRoomCode);
    socket.join(hostRoomCode);
    socket.emit('roomJoined', hostRoomCode); // Notify the client that they have joined the host room

    // Notify the host that a new guest has joined
    io.to(hostSocketId).emit('guestJoined', socket.id);
}

function readjustHost() {
    const others = [...(io.sockets.adapter.rooms.get(hostRoomCode) ?? [])]
        .filter(id => id !== hostSocketId);

    if (others.length > 0) {
        hostSocketId = others[0];
        io.to(hostSocketId).emit('roomHosted', hostRoomCode); // Tell the promoted client they are now the host
        console.log("Host left, promoted new host: " + hostSocketId);
    } else {
        //Everyone left, reset host room and host socket ID
        hostRoomCode = null;
        hostSocketId = null;
    }
}

function setupWebRTC(socket) {
    socket.on('hostOffer', ({to, offer}) => {
        io.to(to).emit('hostOffer', {from: socket.id, offer});
    });

    socket.on('guestAnswer', ({to, answer}) => {
        io.to(hostSocketId).emit('guestAnswer', {from: socket.id, answer});
    });
}

function setupUI(socket) {
    // Canvas and stroke handling
    socket.emit('initCanvas', strokes); // Send all previous strokes to the newly connected client

    socket.on('strokeStart', data => {
        strokes.push({ type: "start", ...data }); // Store the received stroke start data
        socket.to(hostRoomCode).emit('strokeStart', data); // Broadcast to all clients except the sender
    });

    socket.on('strokePoint', data => {
        strokes.push({ type: "point", ...data }); 
        socket.to(hostRoomCode).emit('strokePoint', data); 
    });

    socket.on('strokeEnd', data => {
        strokes.push({ type: "end", ...data }); 
        socket.to(hostRoomCode).emit('strokeEnd', data); 
    });

    socket.on('clearCanvas', () => {
        strokes = [];
        socket.to(hostRoomCode).emit('clearCanvas');
    });
}