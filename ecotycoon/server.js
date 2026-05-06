// ============== SERVER.JS - EcoTycoon ============== 
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { QUESTIONS, getRandomQuestion } = require('./questions');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Конфигурация
const PORT = process.env.PORT || 3000;

// Static файлове
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============== GAME STATE ============== 
const games = {}; // Съхранява всички игри по код
const players = {}; // Съхранява информация за всички играчи

// Регионите на България
const REGIONS = {
  'nw': { name: 'Северозапад', x: 25, y: 35, neighbors: ['nc', 'sw'], category: 'expenses' },
  'nc': { name: 'Северен център', x: 50, y: 25, neighbors: ['nw', 'ne', 'sc'], category: 'pricing' },
  'ne': { name: 'Североизток', x: 75, y: 20, neighbors: ['nc', 'se'], category: 'expenses' },
  'sw': { name: 'Югозапад', x: 30, y: 70, neighbors: ['nw', 'sc'], category: 'resources' },
  'sc': { name: 'Южен център', x: 50, y: 75, neighbors: ['sw', 'nc', 'se'], category: 'personnel' },
  'se': { name: 'Югоизток', x: 75, y: 80, neighbors: ['sc', 'ne'], category: 'capital' }
};

const REGION_INCOMES = {
  'nw': 100,
  'nc': 200,
  'ne': 150,
  'sw': 120,
  'sc': 130,
  'se': 180
};

// ============== ROUTES ============== 
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/teacher.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/student.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

// ============== SOCKET.IO LOGIC ============== 
io.on('connection', (socket) => {
  console.log(`[CONNECTION] ${socket.id}`);

  // ========== TEACHER EVENTS ==========
  
  socket.on('createGame', (data, callback) => {
    const gameCode = generateGameCode();
    const gameId = gameCode;
    
    const game = {
      code: gameCode,
      teacherId: socket.id,
      status: 'waiting', // waiting, started, finished
      players: {},
      regions: initializeRegions(),
      duel: null,
      leaderboard: [],
      gameTime: 0,
      incomeInterval: null
    };
    
    games[gameId] = game;
    socket.gameId = gameId;
    socket.role = 'teacher';
    socket.join(`game-${gameId}`);
    
    console.log(`[GAME CREATED] ${gameCode}`);
    callback({ success: true, code: gameCode });
  });

  socket.on('startGame', (gameId) => {
    const game = games[gameId];
    if (!game || game.teacherId !== socket.id) return;

    game.status = 'started';
    game.gameTime = Date.now();

    // Раздели регионите между играчите
    const playerIds = Object.keys(game.players);
    const regionIds = Object.keys(game.regions);
    
    playerIds.forEach((playerId, index) => {
      const regionId = regionIds[index % regionIds.length];
      game.regions[regionId].owner = playerId;
      game.players[playerId].region = regionId;
    });

    // Начни пасивния доход
    startPassiveIncome(gameId);

    io.to(`game-${gameId}`).emit('gameStarted', {
      regions: game.regions,
      players: game.players
    });

    console.log(`[GAME STARTED] ${gameId}`);
  });

  socket.on('stopGame', (gameId) => {
    const game = games[gameId];
    if (!game || game.teacherId !== socket.id) return;

    game.status = 'finished';
    clearInterval(game.incomeInterval);

    io.to(`game-${gameId}`).emit('gameStopped', { leaderboard: game.leaderboard });
    console.log(`[GAME STOPPED] ${gameId}`);
  });

  // ========== PLAYER EVENTS ==========

  socket.on('joinGame', (data, callback) => {
    const { code, playerName } = data;
    const game = games[code];

    if (!game) {
      callback({ success: false, error: 'Код не съществува' });
      return;
    }

    if (game.status !== 'waiting') {
      callback({ success: false, error: 'Играта вече е стартирана' });
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      capital: 1000,
      income: 0,
      region: null,
      score: 0,
      wins: 0
    };

    game.players[socket.id] = player;
    players[socket.id] = { gameId: code, ...player };
    socket.gameId = code;
    socket.role = 'player';
    socket.join(`game-${code}`);

    callback({ success: true, playerId: socket.id });

    // Извести учителя за нов играч
    io.to(`game-${code}`).emit('playerJoined', {
      players: Object.values(game.players),
      playerCount: Object.keys(game.players).length
    });

    console.log(`[PLAYER JOINED] ${playerName} to ${code}`);
  });

  socket.on('selectRegion', (data) => {
    const { gameId, regionId } = data;
    const game = games[gameId];
    if (!game) return;

    const player = game.players[socket.id];
    if (!player || !player.region) return;

    // Провери дали регионът е съседен
    const currentRegion = REGIONS[player.region];
    if (!currentRegion.neighbors.includes(regionId)) {
      socket.emit('error', 'Регионът не е съседен');
      return;
    }

    const targetRegion = game.regions[regionId];
    if (!targetRegion.owner) {
      socket.emit('error', 'Регионът е свободен');
      return;
    }

    // Начни дуел
    startDuel(gameId, socket.id, regionId);
  });

  socket.on('answerQuestion', (data) => {
    const { gameId, answer } = data;
    const game = games[gameId];
    if (!game || !game.duel) return;

    const duel = game.duel;
    if (!duel.currentQuestionIndex) duel.currentQuestionIndex = 0;

    const isCorrect = answer === duel.currentQuestion.correct;

    if (!duel.scores) {
      duel.scores = {};
    }

    duel.scores[socket.id] = (duel.scores[socket.id] || 0) + (isCorrect ? 1 : 0);

    // Преди на следващ въпрос или край на дуел
    duel.currentQuestionIndex++;

    if (duel.currentQuestionIndex < 3) {
      // Следващ въпрос
      duel.currentQuestion = getRandomQuestion(duel.category);
      io.to(`game-${gameId}`).emit('nextQuestion', {
        question: duel.currentQuestion.question,
        options: duel.currentQuestion.options,
        scores: duel.scores
      });
    } else {
      // Край на дуел
      endDuel(gameId);
    }
  });

  // ========== DISCONNECT ==========

  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] ${socket.id}`);
    
    // Премахни играча от игра
    if (socket.gameId) {
      const game = games[socket.gameId];
      if (game && game.players[socket.id]) {
        delete game.players[socket.id];
        io.to(`game-${socket.gameId}`).emit('playerLeft', {
          players: Object.values(game.players)
        });
      }
    }
    
    delete players[socket.id];
  });
});

// ============== HELPER FUNCTIONS ============== 

function generateGameCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initializeRegions() {
  const regions = {};
  Object.keys(REGIONS).forEach(id => {
    regions[id] = {
      id: id,
      name: REGIONS[id].name,
      owner: null,
      investment: 0,
      x: REGIONS[id].x,
      y: REGIONS[id].y
    };
  });
  return regions;
}

function startPassiveIncome(gameId) {
  const game = games[gameId];
  
  game.incomeInterval = setInterval(() => {
    Object.values(game.players).forEach(player => {
      if (player.region) {
        const income = REGION_INCOMES[player.region] + (game.regions[player.region].investment || 0);
        player.capital += income;
      }
    });

    io.to(`game-${gameId}`).emit('updateEconomy', {
      players: Object.values(game.players).map(p => ({
        id: p.id,
        capital: p.capital,
        income: REGION_INCOMES[p.region] || 0
      }))
    });
  }, 10000); // Всеки 10 сек
}

function startDuel(gameId, attackerId, targetRegionId) {
  const game = games[gameId];
  const attacker = game.players[attackerId];
  const targetRegion = game.regions[targetRegionId];
  const defender = game.players[targetRegion.owner];

  if (!attacker || !defender) return;

  const category = REGIONS[targetRegionId].category;
  const question = getRandomQuestion(category);

  game.duel = {
    attackerId: attackerId,
    defenderId: targetRegion.owner,
    regionId: targetRegionId,
    currentQuestion: question,
    category: category,
    currentQuestionIndex: 0,
    scores: {},
    startTime: Date.now(),
    duration: 60000 // 60 сек
  };

  io.to(`game-${gameId}`).emit('duelStarted', {
    attacker: attacker.name,
    defender: defender.name,
    region: targetRegion.name,
    question: question.question,
    options: question.options,
    duration: 60
  });

  // Таймер за дуел
  const duelTimer = setInterval(() => {
    const elapsed = Date.now() - game.duel.startTime;
    const remaining = Math.max(0, 60 - Math.floor(elapsed / 1000));

    io.to(`game-${gameId}`).emit('duelTimer', { remaining });

    if (remaining === 0) {
      clearInterval(duelTimer);
      endDuel(gameId);
    }
  }, 1000);
}

function endDuel(gameId) {
  const game = games[gameId];
  if (!game.duel) return;

  const duel = game.duel;
  const attacker = game.players[duel.attackerId];
  const defender = game.players[duel.defenderId];
  
  const attackerScore = duel.scores[duel.attackerId] || 0;
  const defenderScore = duel.scores[duel.defenderId] || 0;

  let winner = null;
  if (attackerScore > defenderScore) {
    winner = duel.attackerId;
    attacker.capital += 200;
    game.regions[duel.regionId].owner = duel.attackerId;
    attacker.wins++;
  } else if (defenderScore > attackerScore) {
    winner = duel.defenderId;
    defender.capital += 200;
    defender.wins++;
  } else {
    // Sudden Death
    winner = Math.random() > 0.5 ? duel.attackerId : duel.defenderId;
    game.players[winner].capital += 200;
    game.regions[duel.regionId].owner = winner;
    game.players[winner].wins++;
  }

  // Обнови класация
  game.leaderboard = Object.values(game.players).sort((a, b) => b.wins - a.wins);

  io.to(`game-${gameId}`).emit('duelEnded', {
    winner: game.players[winner].name,
    scores: { [duel.attackerId]: attackerScore, [duel.defenderId]: defenderScore },
    region: game.regions[duel.regionId].name,
    leaderboard: game.leaderboard.map(p => ({ name: p.name, wins: p.wins, capital: p.capital })),
    regions: game.regions
  });

  game.duel = null;
  console.log(`[DUEL ENDED] Winner: ${game.players[winner].name}`);
}

// ============== START SERVER ============== 
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     🎮 EcoTycoon Server Started 🎮     ║
╠════════════════════════════════════════╣
║ Server: http://localhost:${PORT}          ║
║ Teacher: http://localhost:${PORT}/teacher.html ║
║ Student: http://localhost:${PORT}/student.html ║
╚════════════════════════════════════════╝
  `);
});

module.exports = { games, players };
