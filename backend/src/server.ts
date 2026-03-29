import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Game state
let players = {};

// Socket connection
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Add a new player
    socket.on('newPlayer', (username) => {
        players[socket.id] = { username, score: 0 };
        io.emit('updatePlayers', players);
    });
    
    // Handle game logic and updates
    socket.on('updateScore', (score) => {
        if (players[socket.id]) {
            players[socket.id].score += score;
            io.emit('updatePlayers', players);
        }
    });
    
    // Remove player on disconnect
    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
        console.log(`User disconnected: ${socket.id}`);
    });
});

app.get('/', (req, res) => {
    res.send('Econospy Server is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
