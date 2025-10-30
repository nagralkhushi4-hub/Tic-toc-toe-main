const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static('public'));

// Game state storage
const rooms = new Map();

// Generate room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Check win condition
function checkWin(board) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

// Serve the game
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', (playerName) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, symbol: 'X' }],
      board: Array(9).fill(''),
      currentPlayer: 'X',
      gameActive: false
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit('room-created', roomCode);
  });

  socket.on('join-room', (data) => {
    const { roomCode, playerName } = data;
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (room.players.length >= 2) {
      socket.emit('error', 'Room is full');
      return;
    }
    
    room.players.push({ id: socket.id, name: playerName, symbol: 'O' });
    room.gameActive = true;
    
    socket.join(roomCode);
    io.to(roomCode).emit('game-start', { room, players: room.players });
  });

  socket.on('make-move', (data) => {
    const { roomCode, cellIndex } = data;
    const room = rooms.get(roomCode);
    
    if (!room || !room.gameActive) return;
    
    const currentPlayer = room.players.find(p => p.id === socket.id);
    if (!currentPlayer || currentPlayer.symbol !== room.currentPlayer) return;
    
    if (room.board[cellIndex] === '') {
      room.board[cellIndex] = room.currentPlayer;
      
      const winner = checkWin(room.board);
      if (winner) {
        room.gameActive = false;
        room.winner = winner;
      } else if (room.board.every(cell => cell !== '')) {
        room.gameActive = false;
      } else {
        room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
      }
      
      io.to(roomCode).emit('game-update', {
        board: room.board,
        currentPlayer: room.currentPlayer,
        gameActive: room.gameActive,
        winner: room.winner
      });
    }
  });

  socket.on('send-message', (data) => {
    const roomCode = Array.from(socket.rooms).find(room => room !== socket.id);
    if (roomCode) {
      const room = rooms.get(roomCode);
      const player = room?.players.find(p => p.id === socket.id);
      if (player) {
        io.to(roomCode).emit('receive-message', {
          player: player.name,
          message: data.message
        });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Clean up empty rooms
    for (const [roomCode, room] of rooms.entries()) {
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomCode);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Tic Tac Toe server running on port ${PORT}`);
});