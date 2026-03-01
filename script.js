// --- ИНИЦИАЛИЗАЦИЯ СЕТИ (Socket.io) ---
let socket;
try {
    socket = io(); // Подключаемся к серверу Node.js
} catch(e) {
    console.log("Сервер не найден, работаем в локальном режиме для теста");
}

const board = document.getElementById('chess-board');
const statusDisplay = document.getElementById('status');
const notification = document.getElementById('notification-container');
const lobby = document.getElementById('lobby');
const gameContainer = document.getElementById('game-container');
const gameOverOverlay = document.getElementById('game-over-overlay');
const winnerText = document.getElementById('winner-text');

const whitePieces = ['♙', '♖', '♘', '♗', '♕', '♔'];
const blackPieces = ['♟', '♜', '♞', '♝', '♛', '♚'];

let currentPlayer = 'white';
let selectedCell = null;
let myRole = 'white'; // По умолчанию белые (изменится сервером)
let currentRoom = null;
let hasMoved = { 0: false, 4: false, 7: false, 56: false, 60: false, 63: false };

const initialSetup = [
    '♜','♞','♝','♛','♚','♝','♞','♜',
    '♟','♟','♟','♟','♟','♟','♟','♟',
    '','','','','','','','',
    '','','','','','','','',
    '','','','','','','','',
    '','','','','','','','',
    '♙','♙','♙','♙','♙','♙','♙','♙',
    '♖','♘','♗','♕','♔','♗','♘','♖'
];

// --- ЛОГИКА МЕНЮ (ЛОББИ) ---
document.getElementById('hostBtn').onclick = () => {
    const room = document.getElementById('roomInput').value || "1234";
    joinRoom(room);
};

document.getElementById('joinBtn').onclick = () => {
    const room = document.getElementById('roomInput').value;
    if(!room) return showNotify("Введите код комнаты!");
    joinRoom(room);
};

function joinRoom(room) {
    currentRoom = room;
    if(socket) {
        socket.emit('joinRoom', room);
    } else {
        startGameLocally(); // Запуск без сервера для теста
    }
}

// --- СОБЫТИЯ СЕРВЕРА ---
if(socket) {
    socket.on('playerRole', (role) => {
        myRole = role;
        if (myRole === 'black') {
            board.classList.add('flipped'); // Переворачиваем доску для черных
        }
        startGameLocally();
        showNotify("Вы играете за " + (role === 'white' ? "Белых" : "Черных"));
    });

    socket.on('moveMade', (data) => {
        executeMove(data.from, data.to, false);
    });

    socket.on('startGame', () => {
        showNotify("Противник подключился! Начинаем игру.");
    });
    
    socket.on('error', (msg) => showNotify(msg));
}

function startGameLocally() {
    lobby.style.display = 'none';
    gameContainer.style.display = 'flex';
    createBoard();
    updateUI();
}

// --- ГЛАВНАЯ ЛОГИКА ШАХМАТ ---

function createBoard() {
    board.innerHTML = '';
    initialSetup.forEach((piece, i) => {
        const cell = document.createElement('div');
        const row = Math.floor(i / 8), col = i % 8;
        cell.className = `cell ${(row + col) % 2 === 0 ? 'white' : 'black'}`;
        cell.textContent = piece;
        cell.dataset.index = i;
        cell.addEventListener('click', () => handleCellClick(cell));
        board.appendChild(cell);
    });
}

function handleCellClick(cell) {
    // Проверка очереди хода (только свой цвет в свой ход)
    if (currentPlayer !== myRole) return showNotify("Сейчас ход противника!");

    const idx = parseInt(cell.dataset.index);
    
    if (selectedCell) {
        const fromIdx = parseInt(selectedCell.dataset.index);
        
        if (isValidMove(fromIdx, idx)) {
            executeMove(fromIdx, idx, true); // true = мы ходим сами, отправить по сети
        }
        
        selectedCell.classList.remove('selected');
        selectedCell = null;
        clearHints();
    } else {
        const piece = cell.textContent;
        const isMyPiece = (myRole === 'white' ? whitePieces : blackPieces).includes(piece);
        
        if (isMyPiece && currentPlayer === myRole) {
            selectedCell = cell;
            cell.classList.add('selected');
            showHints(idx);
        }
    }
}

function executeMove(from, to, isLocal) {
    const fromCell = board.children[from];
    const toCell = board.children[to];
    const movingPiece = fromCell.textContent;
    const targetPiece = toCell.textContent;

    // Сохранение для отката при шахе
    const oldToText = toCell.textContent;
    
    // Совершаем перемещение
    toCell.textContent = movingPiece;
    fromCell.textContent = '';

    if (isLocal) {
        // Проверка: не подставили ли мы своего короля
        const kingPos = findKing(myRole);
        const opponentColor = myRole === 'white' ? 'black' : 'white';
        if (isSquareAttacked(kingPos, opponentColor)) {
            fromCell.textContent = movingPiece;
            toCell.textContent = oldToText;
            clearHints();
            return showNotify("Нельзя подставлять Короля под шах!");
        }
        
        // Отправка хода по сети
        if(socket) {
            socket.emit('makeMove', { from, to, roomId: currentRoom });
        }
    }

    // Если съели Короля — конец игры
    if (targetPiece === '♔' || targetPiece === '♚') {
        showGameOver(currentPlayer === 'white' ? "Белые победили!" : "Черные победили!", currentPlayer);
    }

    // Рокировка (двигаем ладью)
    if ((movingPiece === '♔' || movingPiece === '♚') && Math.abs(to - from) === 2) {
        const isShort = to > from;
        const rFrom = isShort ? from + 3 : from - 4;
        const rTo = isShort ? from + 1 : from - 1;
        board.children[rTo].textContent = board.children[rFrom].textContent;
        board.children[rFrom].textContent = '';
    }

    // Запоминаем, что фигура ходила (для рокировки)
    if (hasMoved.hasOwnProperty(from)) hasMoved[from] = true;

    // Добавление в зону съеденных
    if (targetPiece !== '') {
        const zoneId = whitePieces.includes(targetPiece) ? 'captured-white' : 'captured-black';
        const span = document.createElement('span');
        span.textContent = targetPiece;
        document.getElementById(zoneId).appendChild(span);
    }

    // Превращение пешки в Ферзя
    if (movingPiece === '♙' && Math.floor(to / 8) === 0) toCell.textContent = '♕';
    if (movingPiece === '♟' && Math.floor(to / 8) === 7) toCell.textContent = '♛';

    // Смена хода
    currentPlayer = (currentPlayer === 'white') ? 'black' : 'white';
    updateUI();
}

function isValidMove(from, to) {
    const fR = Math.floor(from / 8), fC = from % 8;
    const tR = Math.floor(to / 8), tC = to % 8;
    const dx = Math.abs(tC - fC), dy = Math.abs(tR - fR);
    const p = board.children[from].textContent;
    const target = board.children[to].textContent;
    const isW = whitePieces.includes(p);

    if (target && isW === whitePieces.includes(target)) return false;

    switch (p) {
        case '♙': case '♟':
            const d = isW ? -1 : 1;
            if (fC === tC && !target && tR - fR === d) return true;
            if (fC === tC && !target && fR === (isW ? 6 : 1) && tR - fR === 2 * d) 
                return board.children[(fR + d) * 8 + fC].textContent === '';
            if (dx === 1 && tR - fR === d && target) return true;
            return false;
        case '♖': case '♜': return (fR === tR || fC === tC) && isPathClear(from, to);
        case '♗': case '♝': return (dx === dy) && isPathClear(from, to);
        case '♕': case '♛': return (dx === dy || fR === tR || fC === tC) && isPathClear(from, to);
        case '♘': case '♞': return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
        case '♔': case '♚': 
            if (dx <= 1 && dy <= 1) return true;
            if (dy === 0 && dx === 2 && !hasMoved[from]) {
                const rIdx = tC > fC ? (isW ? 63 : 7) : (isW ? 56 : 0);
                return !hasMoved[rIdx] && isPathClear(from, rIdx);
            }
            return false;
    }
    return false;
}

function isPathClear(from, to) {
    const fR = Math.floor(from / 8), fC = from % 8;
    const tR = Math.floor(to / 8), tC = to % 8;
    const sR = tR > fR ? 1 : (tR < fR ? -1 : 0);
    const sC = tC > fC ? 1 : (tC < fC ? -1 : 0);
    let r = fR + sR, c = fC + sC;
    while (r !== tR || c !== tC) {
        if (board.children[r * 8 + c].textContent !== '') return false;
        r += sR; c += sC;
    }
    return true;
}

function findKing(color) {
    const icon = color === 'white' ? '♔' : '♚';
    for (let i = 0; i < 64; i++) if (board.children[i].textContent === icon) return i;
    return -1;
}

function isSquareAttacked(idx, atkCol) {
    for (let i = 0; i < 64; i++) {
        const p = board.children[i].textContent;
        if (p && (atkCol === 'white' ? whitePieces : blackPieces).includes(p)) {
            if (isValidMove(i, idx)) return true;
        }
    }
    return false;
}

function showHints(from) {
    for (let i = 0; i < 64; i++) {
        if (isValidMove(from, i)) {
            const cell = board.children[i];
            cell.classList.add('possible-move');
            if (cell.textContent !== '') cell.classList.add('has-enemy');
        }
    }
}

function clearHints() {
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('possible-move', 'has-enemy'));
}

function showNotify(msg) {
    notification.textContent = msg;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
}

function showGameOver(msg, winner) {
    const modal = document.querySelector('.modal');
    modal.classList.remove('black-win');
    if(winner === 'black') modal.classList.add('black-win');
    winnerText.textContent = msg;
    gameOverOverlay.style.display = 'flex';
}

function updateUI() {
    const kPos = findKing(currentPlayer);
    const check = isSquareAttacked(kPos, currentPlayer === 'white' ? 'black' : 'white');
    statusDisplay.textContent = `Ход: ${currentPlayer === 'white' ? 'Белые' : 'Черные'}${check ? ' — ШАХ!' : ''}`;
    statusDisplay.style.color = check ? '#ff4d4d' : 'white';
    if (currentPlayer === myRole) statusDisplay.textContent += " (ВАШ ХОД)";
}
