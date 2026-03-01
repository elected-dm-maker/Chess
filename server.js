const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Сервер будет раздавать все файлы из текущей папки
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    socket.on('joinRoom', (roomId) => {
        const room = io.sockets.adapter.rooms.get(roomId);
        const numClients = room ? room.size : 0;

        if (numClients === 0) {
            socket.join(roomId);
            socket.emit('playerRole', 'white');
        } else if (numClients === 1) {
            socket.join(roomId);
            socket.emit('playerRole', 'black');
            io.to(roomId).emit('startGame');
        } else {
            socket.emit('error', 'Комната уже заполнена');
        }
    });

    socket.on('makeMove', (data) => {
        // Пересылаем ход второму игроку в комнате
        socket.to(data.roomId).emit('moveMade', data);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
