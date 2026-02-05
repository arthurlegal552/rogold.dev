const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require("helmet");
const fs = require('fs');
const {
    saveGame,
    getGame,
    getAllGames,
    deleteGame,
    updateGameLikes,
    updateGameDislikes,
    updateGameVisits,
    saveGameSync,
    getGameSync,
    getAllGamesSync,
    deleteGameSync,
    saveMap,
    getMap,
    getAllMaps,
    deleteMap,
    savePlayer,
    getPlayer,
    getPlayerByNickname,
    getAllNicknames,
    deletePlayer,
    registerAccount,
    loginAccount,
    updateAccountPassword,
    deleteAccount,
    getAccount
} = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    // Enable per-message compression with a threshold to reduce bandwidth for large payloads
    perMessageDeflate: {
        threshold: 1024
    },
    // Faster liveness detection to drop stale sockets
    pingInterval: 15000,
    pingTimeout: 10000
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'players_data.json');
let playersData = {};

const MAPS_DIR = path.join(__dirname, 'maps');
// Ensure maps directory exists
if (!fs.existsSync(MAPS_DIR)) {
    fs.mkdirSync(MAPS_DIR);
}

const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
// Ensure thumbnails directory exists
if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR);
}

// Load existing player data from file
if (fs.existsSync(DATA_FILE)) {
    playersData = JSON.parse(fs.readFileSync(DATA_FILE));
}

// Save player data to file
function savePlayersData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(playersData, null, 2));
}

// Serve static files
app.use(express.static(__dirname));

// Serve thumbnails directory
app.use('/thumbnails', express.static(THUMBNAILS_DIR));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: Object.keys(players).length });
});

// Add JSON parsing middleware before API routes (with larger limit for game publishing)
app.use(express.json({ limit: '50mb' }));

// Account API endpoints
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }
        if (username.length < 3) {
            return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
        }
        if (password.length < 4) {
            return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
        }
        const result = await registerAccount(username, password);
        res.json(result);
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }
        const result = await loginAccount(username, password);
        res.json(result);
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.put('/api/change-password', async (req, res) => {
    try {
        const { username, currentPassword, newPassword } = req.body;
        if (!username || !currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        // First verify current password
        const loginResult = await loginAccount(username, currentPassword);
        if (!loginResult.success) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }
        if (newPassword.length < 4) {
            return res.status(400).json({ success: false, message: 'New password must be at least 4 characters' });
        }
        const result = await updateAccountPassword(username, newPassword);
        res.json(result);
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.delete('/api/account', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }
        // Verify password before deleting
        const loginResult = await loginAccount(username, password);
        if (!loginResult.success) {
            return res.status(400).json({ success: false, message: 'Password is incorrect' });
        }
        const result = await deleteAccount(username);
        res.json(result);
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Search users by username pattern
app.get('/api/users/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 1) {
            return res.json({ users: [] });
        }
        // Since we can't do LIKE queries easily in sql.js, we'll get all nicknames from players table
        // Note: This only searches players who have played the game, not all registered accounts
        const nicknames = await getAllNicknames();
        const matchingUsers = nicknames.filter(nickname => 
            nickname.toLowerCase().includes(q.toLowerCase())
        );
        res.json({ users: matchingUsers.slice(0, 10) }); // Return max 10 results
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get user exists check
app.get('/api/users/exists/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const account = await getAccount(username);
        const player = await getPlayerByNickname(username);
        res.json({ 
            exists: !!(account || player),
            hasAccount: !!account,
            hasProfile: !!player
        });
    } catch (error) {
        console.error('Error checking user exists:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Map persistence API (SQLite database)
app.get('/api/maps', async (req, res) => {
    try {
        const maps = await getAllMaps();
        res.json({ maps });
    } catch (e) {
        res.status(500).json({ error: 'Failed to list maps' });
    }
});

app.get('/api/maps/:name', async (req, res) => {
    try {
        const safe = String(req.params.name || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64);
        if (!safe) return res.status(400).json({ error: 'Invalid name' });
        const mapData = await getMap(safe);
        if (!mapData) return res.status(404).json({ error: 'Not found' });
        res.type('application/json').send(JSON.stringify(mapData));
    } catch (e) {
        res.status(500).json({ error: 'Failed to load map' });
    }
});

app.post('/api/maps/:name', async (req, res) => {
    try {
        const safe = String(req.params.name || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64);
        if (!safe) return res.status(400).json({ error: 'Invalid name' });
        const data = req.body;
        if (!data || typeof data !== 'object') {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }
        data.name = safe;
        data.updatedAt = new Date().toISOString();
        if (!data.createdAt) data.createdAt = data.updatedAt;

        const result = await saveMap(safe, data);
        if (result.success) {
            res.json({ ok: true, name: safe });
        } else {
            res.status(500).json({ error: 'Failed to save map' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to save map' });
    }
});

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      // Allow secure and insecure websocket connections (wss/ws) in addition to self
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  })
);

// Helper function to save data URL as file
function saveDataUrlAsFile(dataUrl, filename) {
    return new Promise((resolve, reject) => {
        try {
            // Ensure thumbnails directory exists
            if (!fs.existsSync(THUMBNAILS_DIR)) {
                fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
            }

            // Extract base64 data from data URL
            const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                reject(new Error('Invalid data URL'));
                return;
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            const filePath = path.join(THUMBNAILS_DIR, filename);
            fs.writeFile(filePath, buffer, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(filePath);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Games API endpoint for publishing (SQLite database)
app.post('/api/games', async (req, res) => {
    try {
        const gameData = req.body;

        // Check if this is an update to existing game
        let isUpdate = false;
        let existingGame = null;
        if (gameData.gameId) {
            existingGame = await getGame(gameData.gameId);
            isUpdate = !!existingGame;
        }

        if (!gameData || (!isUpdate && !gameData.title)) {
            return res.status(400).json({ error: 'Game title is required for new games' });
        }

        // Generate game ID if not provided
        const gameId = gameData.gameId || 'game_' + Date.now();

        // For updates, merge with existing data
        let finalGameData = gameData;
        if (isUpdate) {
            finalGameData = { ...existingGame, ...gameData };
        }

        // Handle thumbnail if it's a data URL
        if (finalGameData.thumbnail && finalGameData.thumbnail.startsWith('data:')) {
            try {
                // Extract mime type to determine file extension
                const matches = finalGameData.thumbnail.match(/^data:([A-Za-z-+\/]+);base64,/);
                const mimeType = matches ? matches[1] : 'image/png';
                let extension = mimeType.split('/')[1] || 'png'; // e.g., 'png', 'jpeg', 'jpg'
                if (extension === 'jpeg') extension = 'jpg'; // Use 'jpg' instead of 'jpeg'
                const thumbnailFilename = `${gameId}_thumbnail.${extension}`;
                await saveDataUrlAsFile(finalGameData.thumbnail, thumbnailFilename);
                // Update game data to use file path instead of data URL
                finalGameData.thumbnail = `/thumbnails/${thumbnailFilename}`;
            } catch (error) {
                console.warn('Failed to save thumbnail as file, keeping existing:', error);
                // Keep existing thumbnail for updates
                if (isUpdate && existingGame.thumbnail) {
                    finalGameData.thumbnail = existingGame.thumbnail;
                } else {
                    finalGameData.thumbnail = 'thumbnail1.jpg';
                }
            }
        } else if (!isUpdate) {
            finalGameData.thumbnail = 'thumbnail1.jpg';
        }

        // Ensure creator_id is set (should be passed from frontend)
        if (!finalGameData.creator_id) {
            return res.status(400).json({ error: 'Creator ID is required' });
        }

        // Save game data to database
        const result = await saveGame(gameId, finalGameData);
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to save game' });
        }

        const action = isUpdate ? 'updated' : 'published';
        console.log(`Game "${finalGameData.title}" ${action} with ID: ${gameId} by creator: ${finalGameData.creator_id}`);

        const message = isUpdate ? 'Game updated successfully' : 'Game published successfully';
        res.json({
            success: true,
            gameId: gameId,
            message: message
        });
    } catch (error) {
        console.error('Error publishing game:', error);
        res.status(500).json({ error: 'Failed to publish game' });
    }
});

// Get published games (SQLite database)
app.get('/api/games', async (req, res) => {
    try {
        const games = await getAllGames();
        res.json({ games });
    } catch (error) {
        console.error('Error listing games:', error);
        res.status(500).json({ error: 'Failed to list games' });
    }
});

// Get specific game (SQLite database)
app.get('/api/games/:gameId', async (req, res) => {
    try {
        const gameId = req.params.gameId;
        const gameData = await getGame(gameId);

        if (!gameData) {
            return res.status(404).json({ error: 'Game not found' });
        }

        res.json(gameData);
    } catch (error) {
        console.error('Error loading game:', error);
        res.status(500).json({ error: 'Failed to load game' });
    }
});

// Update specific game (SQLite database)
app.put('/api/games/:gameId', async (req, res) => {
    try {
        const gameId = req.params.gameId;
        const updateData = req.body;

        // Check if game exists
        const existingGame = await getGame(gameId);
        if (!existingGame) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Handle thumbnail if it's a data URL
        if (updateData.thumbnail && updateData.thumbnail.startsWith('data:')) {
            try {
                // Extract mime type to determine file extension
                const matches = updateData.thumbnail.match(/^data:([A-Za-z-+\/]+);base64,/);
                const mimeType = matches ? matches[1] : 'image/png';
                let extension = mimeType.split('/')[1] || 'png';
                if (extension === 'jpeg') extension = 'jpg';
                const thumbnailFilename = `${gameId}_thumbnail.${extension}`;
                await saveDataUrlAsFile(updateData.thumbnail, thumbnailFilename);
                // Update game data to use file path instead of data URL
                updateData.thumbnail = `/thumbnails/${thumbnailFilename}`;
            } catch (error) {
                console.warn('Failed to save thumbnail as file, keeping existing:', error);
                // Keep existing thumbnail
                updateData.thumbnail = existingGame.thumbnail;
            }
        }

        // Merge with existing data
        const updatedGameData = { ...existingGame, ...updateData, updatedAt: new Date().toISOString() };

        // Save updated game data to database
        const result = await saveGame(gameId, updatedGameData);
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to update game' });
        }

        console.log(`Game "${updatedGameData.title}" updated with ID: ${gameId}`);

        res.json({
            success: true,
            gameId: gameId,
            message: 'Game updated successfully'
        });
    } catch (error) {
        console.error('Error updating game:', error);
        res.status(500).json({ error: 'Failed to update game' });
    }
});

// Get game details with player count
app.get('/api/game-details/:gameId', async (req, res) => {
    try {
        const gameId = req.params.gameId;
        const gameData = await getGame(gameId);

        if (!gameData) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Get player count in room
        const room = io.sockets.adapter.rooms.get(gameId);
        const playerCount = room ? room.size : 0;

        res.json({
            ...gameData,
            playing: playerCount
        });
    } catch (error) {
        console.error('Error loading game details:', error);
        res.status(500).json({ error: 'Failed to load game details' });
    }
});

// Delete specific game (SQLite database)
app.delete('/api/games/:gameId', async (req, res) => {
    try {
        const gameId = req.params.gameId;

        // Check if game exists
        const gameData = await getGame(gameId);
        if (!gameData) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Delete thumbnail file if it exists
        if (gameData.thumbnail && gameData.thumbnail.startsWith('/thumbnails/')) {
            const thumbnailPath = path.join(__dirname, gameData.thumbnail);
            try {
                if (fs.existsSync(thumbnailPath)) {
                    fs.unlinkSync(thumbnailPath);
                    console.log(`Deleted thumbnail file: ${thumbnailPath}`);
                }
            } catch (error) {
                console.warn('Failed to delete thumbnail file:', error);
            }
        }

        // Delete game from database
        const result = await deleteGame(gameId);
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to delete game' });
        }

        console.log(`Game "${gameData.title}" deleted with ID: ${gameId}`);

        res.json({
            success: true,
            message: 'Game deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting game:', error);
        res.status(500).json({ error: 'Failed to delete game' });
    }
});

// Like a game
app.put('/api/games/:gameId/like', async (req, res) => {
    try {
        const gameId = req.params.gameId;

        // Check if game exists
        const gameData = await getGame(gameId);
        if (!gameData) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Increment likes
        const result = await updateGameLikes(gameId, 1);
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to like game' });
        }

        // Get updated game data
        const updatedGame = await getGame(gameId);

        res.json({
            success: true,
            likes: updatedGame.likes,
            dislikes: updatedGame.dislikes
        });
    } catch (error) {
        console.error('Error liking game:', error);
        res.status(500).json({ error: 'Failed to like game' });
    }
});

// Rate a game (like/dislike with toggle)
app.put('/api/games/:gameId/rate', async (req, res) => {
    try {
        const gameId = req.params.gameId;
        const { action } = req.body;

        // Check if game exists
        const gameData = await getGame(gameId);
        if (!gameData) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (action === 'like') {
            await updateGameLikes(gameId, 1);
        } else if (action === 'dislike') {
            await updateGameDislikes(gameId, 1);
        } else if (action === 'change_to_like') {
            await updateGameDislikes(gameId, -1);
            await updateGameLikes(gameId, 1);
        } else if (action === 'change_to_dislike') {
            await updateGameLikes(gameId, -1);
            await updateGameDislikes(gameId, 1);
        } else if (action === 'remove_like') {
            await updateGameLikes(gameId, -1);
        } else if (action === 'remove_dislike') {
            await updateGameDislikes(gameId, -1);
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

        // Get updated game data
        const updatedGame = await getGame(gameId);

        res.json({
            success: true,
            likes: updatedGame.likes,
            dislikes: updatedGame.dislikes
        });
    } catch (error) {
        console.error('Error rating game:', error);
        res.status(500).json({ error: 'Failed to rate game' });
    }
});

// Increment game visits
app.post('/api/games/:gameId/visit', async (req, res) => {
    try {
        const gameId = req.params.gameId;

        // Check if game exists
        const gameData = await getGame(gameId);
        if (!gameData) {
            return res.status(404).json({ error: 'Game not found' });
        }

        await updateGameVisits(gameId, 1);

        // Get updated game data
        const updatedGame = await getGame(gameId);

        res.json({
            success: true,
            visits: updatedGame.visits
        });
    } catch (error) {
        console.error('Error incrementing visits:', error);
        res.status(500).json({ error: 'Failed to increment visits' });
    }
});

// Get user stats (total visits for all games)
app.get('/api/user/:username/stats', async (req, res) => {
    try {
        const username = req.params.username;

        // Get all games by this creator
        const allGames = await getAllGames();
        const userGames = allGames.filter(game => game.creator_id === username);

        // Calculate total visits
        const totalVisits = userGames.reduce((sum, game) => sum + (game.visits || 0), 0);

        res.json({
            totalVisits: totalVisits,
            totalGames: userGames.length
        });
    } catch (error) {
        console.error('Error getting user stats:', error);
        res.status(500).json({ error: 'Failed to get user stats' });
    }
});

// Get games by user
app.get('/api/user/:username/games', async (req, res) => {
    try {
        const username = req.params.username;

        // Get all games by this creator
        const allGames = await getAllGames();
        const userGames = allGames.filter(game => game.creator_id === username);

        res.json({ games: userGames });
    } catch (error) {
        console.error('Error getting user games:', error);
        res.status(500).json({ error: 'Failed to get user games' });
    }
});

// Store connected players
let players = {};
const activeNicknames = {};
const GAME_TICK_RATE = 30; // 30 updates per second
// Networking/synchronization tunables
const MAX_MOVE_RATE = 30; // Max accepted move packets per second per client
const WORLD_BOUNDS = { xz: 250, yMin: 0, yMax: 500 }; // Clamp world to a reasonable area to avoid bad data

// Physics ownership for parts
let partOwnership = {}; // partName -> ownerId

// Store parts per room
let parts = {}; // room -> { partName: partData }

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}
function normalizeAngle(a) {
  // keep angle between -PI..PI
  a = Number(a) || 0;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Room selection (per-game isolation)
    const roomName = (socket.handshake && socket.handshake.auth && socket.handshake.auth.room)
        ? String(socket.handshake.auth.room)
        : 'default';
    socket.join(roomName);
    socket.roomName = roomName;

    // REGISTRO DE NICKNAME ÚNICO
    socket.on('register', ({ nickname, faceId }) => {
        // Bloqueia nick duplicado
        if (Object.values(activeNicknames).includes(nickname)) {
            socket.emit('nicknameError', 'A sua conta já está sendo usada neste mesmo momento por favor saia do jogo e troque a conta');
            socket.disconnect();
            return;
        }
        // Marca nickname como ativo
        activeNicknames[socket.id] = nickname;
        socket.nickname = nickname;

        // Cria player
        players[socket.id] = {
            id: socket.id,
            nickname: nickname,
            room: roomName,
            x: 0, y: 3, z: 0,
            rotation: 0,
            isMoving: false,
            health: 100,
            colors: {
                head: '#FAD417',
                torso: '#00A2FF',
                arms: '#FAD417',
                legs: '#80C91C'
            },
            hatId: null,
            faceId: faceId || 'OriginalGlitchedFace.webp'
        };

        // Envia apenas os players da mesma sala para o novo
        const roomPlayers = Object.fromEntries(
            Object.entries(players).filter(([_, p]) => p.room === roomName)
        );
        socket.emit('initialPlayers', roomPlayers);
        socket.emit('initialParts', Object.values(parts[roomName] || {}));
        // Avise os outros da mesma sala
        socket.to(roomName).emit('playerJoined', players[socket.id]);
    });

    // CHAT
    socket.on('chat', msg => {
        io.to(roomName).emit('chat', { playerId: socket.id, nickname: socket.nickname, message: msg });
    });

    // MOVIMENTO
    socket.on('playerMove', (data) => {
        const now = Date.now();

        // Rate-limit incoming move packets to protect server and network
        if (socket.lastMoveAt && now - socket.lastMoveAt < (1000 / MAX_MOVE_RATE)) {
            return;
        }
        socket.lastMoveAt = now;

        const p = players[socket.id];
        if (!p) return;

        // Sanitize and clamp incoming data
        const x = clamp(data?.x, -WORLD_BOUNDS.xz, WORLD_BOUNDS.xz);
        const y = clamp(data?.y, WORLD_BOUNDS.yMin, WORLD_BOUNDS.yMax);
        const z = clamp(data?.z, -WORLD_BOUNDS.xz, WORLD_BOUNDS.xz);
        const rotation = normalizeAngle(data?.rotation ?? 0);
        const isMoving = !!data?.isMoving;
        const isInAir = !!data?.isInAir;

        p.x = x;
        p.y = y;
        p.z = z;
        p.rotation = rotation;
        p.isMoving = isMoving;
        p.isInAir = isInAir;
        p.nickname = socket.nickname; // always maintain nickname
    });

    // CUSTOMIZAÇÃO
    socket.on('playerCustomize', (colors) => {
        if (players[socket.id]) {
            players[socket.id].colors = colors;
        }
    });

    // CHAPÉU
    socket.on('equipHat', ({ hatId }) => {
        if (players[socket.id]) {
            players[socket.id].hatId = hatId;
        }
        io.to(roomName).emit('playerHatChanged', { playerId: socket.id, hatId });
    });
    
    // FACE
    socket.on('faceChange', ({ faceId }) => {
        if (players[socket.id]) {
            players[socket.id].faceId = faceId;
        }
        io.to(roomName).emit('playerFaceChanged', { playerId: socket.id, faceId });
    });

    // FERRAMENTAS
    socket.on("equipTool", (data) => {
        socket.to(roomName).emit("remoteEquip", { playerId: socket.id, tool: data.tool });
    });
    socket.on("unequipTool", (data) => {
        socket.to(roomName).emit("remoteUnequip", { playerId: socket.id, tool: data.tool });
    });

    // DANÇA
    socket.on('dance', () => {
        socket.to(roomName).emit('dance', socket.id);
    });
    socket.on('stopDance', () => {
        socket.to(roomName).emit('stopDance', socket.id);
    });

    // ROCKET
    socket.on('launchRocket', data => {
        io.to(roomName).emit('spawnRocket', data);
    });

    // EXPLOSÃO
    socket.on('explosion', (data) => {
        io.to(roomName).emit('explosion', data);
    });

    // PART CREATION SYNC
    socket.on('partCreated', (data) => {
        if (!data || !data.name) return;
        if (!parts[roomName]) parts[roomName] = {};
        if (!parts[roomName][data.name]) {
            parts[roomName][data.name] = data;
            socket.to(roomName).emit('partCreated', data);
        }
    });

    // PART MOVEMENT SYNC: relay part transform updates to other clients in the same room
    socket.on('partMoved', (data) => {
        // data should contain: { name, position: {x,y,z}, rotation: {x,y,z}, velocity? }
        if (!data || !data.name) return;
        // Update stored part data
        if (parts[roomName] && parts[roomName][data.name]) {
            parts[roomName][data.name].position = data.position;
            parts[roomName][data.name].rotation = data.rotation;
        }
        // Broadcast to others in the same room
        socket.to(roomName).emit('partMoved', {
            name: String(data.name),
            position: data.position,
            rotation: data.rotation,
            velocity: data.velocity || null
        });
    });

    // PART DELETION SYNC
    socket.on('partDeleted', (data) => {
        if (!data || !data.name) return;
        if (parts[roomName]) delete parts[roomName][data.name];
        socket.to(roomName).emit('partDeleted', data);
    });

    // TAKE DAMAGE
    socket.on('takeDamage', ({ damage }) => {
        const p = players[socket.id];
        if (!p) return;
        p.health = Math.max(0, p.health - damage);
        if (p.health <= 0) {
            io.to(roomName).emit('playerDied', { killer: 'unknown', victim: socket.id });
        } else {
            io.to(roomName).emit('healthUpdate', { playerId: socket.id, health: p.health });
        }
    });

    // KILL EVENT -> update victim's health, emit playerDied only if health <=0
    socket.on('playerHit', ({ killer, victim }) => {
        const victimPlayer = players[victim];
        if (victimPlayer) {
            victimPlayer.health = Math.max(0, victimPlayer.health - 25);
            if (victimPlayer.health <= 0) {
                io.to(roomName).emit('playerDied', { killer, victim });
            } else {
                io.to(victim).emit('healthUpdate', { health: victimPlayer.health });
            }
        }
    });

    // RAGDOLL
    socket.on('playerRagdoll', (data) => {
        io.to(roomName).emit('playerRagdoll', data);
    });

    // RESPAWN
    socket.on('respawn', () => {
        if (players[socket.id]) {
            players[socket.id].health = 100;
        }
    });

    // ADMIN COMANDOS
    socket.on('danielCommand', () => {
        if (socket.nickname === 'daniel244') {
            if (socket.lastDaniel && Date.now() - socket.lastDaniel < 20000) return;
            socket.lastDaniel = Date.now();
            io.to(roomName).emit('danielEvent');
        }
    });
    socket.on('adminExplode', ({ target }) => {
        if (socket.nickname === 'notrealregi') {
            for (let id in players) {
                if (players[id].room === roomName && players[id].nickname === target) {
                    io.to(roomName).emit('adminExplode', { target });
                    break;
                }
            }
        }
    });

    // DESCONECTAR
    socket.on('disconnect', () => {
        delete activeNicknames[socket.id];
        const r = players[socket.id]?.room || roomName;
        delete players[socket.id];
        io.to(r).emit('playerLeft', socket.id);
    });
});

// GAME LOOP
setInterval(() => {
    // Emit per-room states to reduce cross-room traffic
    const byRoom = {};
    for (const [id, p] of Object.entries(players)) {
        const r = p.room || 'default';
        if (!byRoom[r]) byRoom[r] = {};
        byRoom[r][id] = p;
    }
    for (const [r, state] of Object.entries(byRoom)) {
        io.to(r).volatile.emit('gameState', state);
    }

    // Send initial faces data to new players
    for (const [r, state] of Object.entries(byRoom)) {
        const faces = {};
        for (const [id, p] of Object.entries(state)) {
            if (p.faceId) faces[id] = p.faceId;
        }
        if (Object.keys(faces).length > 0) {
            io.to(r).emit('initialFaces', faces);
        }
    }
}, 1000 / GAME_TICK_RATE);

// 404 handler
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - Página não encontrada</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    text-align: center;
                    background-color: #f0f0f0;
                    margin: 0;
                    padding: 50px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    padding: 40px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                img {
                    max-width: 100%;
                    height: auto;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #333;
                    margin-bottom: 20px;
                }
                p {
                    color: #666;
                    font-size: 18px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <img src="/imgs/404.jpg" alt="404 Error">
                <h1>404 - Página não encontrada</h1>
                <p>Está página não existe! Volte agora!!!!</p>
            </div>
        </body>
        </html>
    `);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
