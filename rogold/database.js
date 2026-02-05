const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Initialize sql.js asynchronously
const dbPath = path.join(__dirname, 'rogold.db');
let dbPromise = initSqlJs().then(SQL => {
  let db;
  try {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(filebuffer);
  } catch (err) {
    db = new SQL.Database(); // Create new database if file doesn't exist
  }
  return db;
});

// Function to save database to file
async function saveDatabase() {
  try {
    const db = await dbPromise;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

// Create tables
dbPromise.then(db => {
  db.run(`
      CREATE TABLE IF NOT EXISTS games (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          data TEXT NOT NULL,
          thumbnail TEXT,
          creator_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
  `);

  db.run(`
      CREATE TABLE IF NOT EXISTS maps (
          name TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
  `);

  db.run(`
      CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          nickname TEXT UNIQUE NOT NULL,
          data TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
  `);

  db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
          username TEXT PRIMARY KEY,
          password TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
  `);

  // Check if creator_id column exists in games table, if not add it
  const tableInfo = db.exec("PRAGMA table_info(games)");
  if (tableInfo.length > 0) {
      const hasCreatorId = tableInfo[0].values.some(row => row[1] === 'creator_id');
      if (!hasCreatorId) {
          db.run(`ALTER TABLE games ADD COLUMN creator_id TEXT`);
      }
      const hasLikes = tableInfo[0].values.some(row => row[1] === 'likes');
      if (!hasLikes) {
          db.run(`ALTER TABLE games ADD COLUMN likes INTEGER DEFAULT 0`);
      }
      const hasDislikes = tableInfo[0].values.some(row => row[1] === 'dislikes');
      if (!hasDislikes) {
          db.run(`ALTER TABLE games ADD COLUMN dislikes INTEGER DEFAULT 0`);
      }
      const hasVisits = tableInfo[0].values.some(row => row[1] === 'visits');
      if (!hasVisits) {
          db.run(`ALTER TABLE games ADD COLUMN visits INTEGER DEFAULT 0`);
      }
  }

  // Save database after creating tables
  saveDatabase();
});

// Game functions
async function saveGame(gameId, gameData) {
    try {
        const db = await dbPromise;
        const { title, thumbnail, creator_id, likes, dislikes, visits, ...data } = gameData;
        const sql = `
            INSERT OR REPLACE INTO games (id, title, data, thumbnail, creator_id, likes, dislikes, visits, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        const stmt = db.prepare(sql);
        stmt.run([gameId, title, JSON.stringify(data), thumbnail, creator_id, likes || 0, dislikes || 0, visits || 0]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

async function getGame(gameId) {
    try {
        const db = await dbPromise;
        const sql = `SELECT * FROM games WHERE id = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject([gameId]);
        stmt.free();
        if (result && result.id) {
            const data = JSON.parse(result.data);
            return {
                id: result.id,
                title: result.title,
                thumbnail: result.thumbnail,
                creator_id: result.creator_id,
                likes: result.likes || 0,
                dislikes: result.dislikes || 0,
                visits: result.visits || 0,
                ...data,
                createdAt: result.created_at,
                updatedAt: result.updated_at
            };
        } else {
            return null;
        }
    } catch (err) {
        throw err;
    }
}

async function getAllGames() {
    try {
        const db = await dbPromise;
        const sql = `SELECT id, title, thumbnail, creator_id, created_at, likes, dislikes, visits FROM games ORDER BY updated_at DESC`;
        const stmt = db.prepare(sql);
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({
                id: row.id,
                title: row.title,
                thumbnail: row.thumbnail,
                creator_id: row.creator_id,
                likes: row.likes || 0,
                dislikes: row.dislikes || 0,
                visits: row.visits || 0,
                timestamp: row.created_at
            });
        }
        stmt.free();
        return results;
    } catch (err) {
        throw err;
    }
}

async function deleteGame(gameId) {
    try {
        const db = await dbPromise;
        const sql = `DELETE FROM games WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run([gameId]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

async function updateGameLikes(gameId, increment) {
    try {
        const db = await dbPromise;
        const sql = `UPDATE games SET likes = likes + ? WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run([increment, gameId]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

async function updateGameDislikes(gameId, increment) {
    try {
        const db = await dbPromise;
        const sql = `UPDATE games SET dislikes = dislikes + ? WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run([increment, gameId]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

async function updateGameVisits(gameId, increment) {
    try {
        const db = await dbPromise;
        const sql = `UPDATE games SET visits = visits + ? WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run([increment, gameId]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

// Synchronous versions for backward compatibility
async function saveGameSync(gameId, gameData) {
    try {
        const db = await dbPromise;
        const { title, thumbnail, creator_id, ...data } = gameData;
        const sql = `
            INSERT OR REPLACE INTO games (id, title, data, thumbnail, creator_id, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        const stmt = db.prepare(sql);
        stmt.run([gameId, title || '', JSON.stringify(data), thumbnail || '', creator_id || '']);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (error) {
        console.error('Error saving game:', error);
        return { success: false, error: error.message };
    }
}

async function getGameSync(gameId) {
    try {
        const db = await dbPromise;
        const sql = `SELECT * FROM games WHERE id = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject([gameId]);
        stmt.free();
        if (result && result.id) {
            const data = JSON.parse(result.data);
            return {
                id: result.id,
                title: result.title,
                thumbnail: result.thumbnail,
                creator_id: result.creator_id,
                ...data,
                createdAt: result.created_at,
                updatedAt: result.updated_at
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting game:', error);
        return null;
    }
}

async function getAllGamesSync() {
    try {
        const db = await dbPromise;
        const sql = `SELECT id, title, thumbnail, creator_id, created_at FROM games ORDER BY updated_at DESC`;
        const stmt = db.prepare(sql);
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({
                id: row.id,
                title: row.title,
                thumbnail: row.thumbnail,
                creator_id: row.creator_id,
                timestamp: row.created_at
            });
        }
        stmt.free();
        return results;
    } catch (error) {
        console.error('Error getting all games:', error);
        return [];
    }
}

async function deleteGameSync(gameId) {
    try {
        const db = await dbPromise;
        const sql = `DELETE FROM games WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run([gameId]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (error) {
        console.error('Error deleting game:', error);
        return { success: false, error: error.message };
    }
}

// Map functions
async function saveMap(mapName, mapData) {
    try {
        const db = await dbPromise;
        const sql = `
            INSERT OR REPLACE INTO maps (name, data, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `;
        const stmt = db.prepare(sql);
        stmt.run([mapName, JSON.stringify(mapData)]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

async function getMap(mapName) {
    try {
        const db = await dbPromise;
        const sql = `SELECT * FROM maps WHERE name = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject([mapName]);
        stmt.free();
        if (result && result.name) {
            return JSON.parse(result.data);
        } else {
            return null;
        }
    } catch (err) {
        throw err;
    }
}

async function getAllMaps() {
    try {
        const db = await dbPromise;
        const sql = `SELECT name FROM maps ORDER BY updated_at DESC`;
        const stmt = db.prepare(sql);
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push(row.name);
        }
        stmt.free();
        return results;
    } catch (err) {
        throw err;
    }
}

async function deleteMap(mapName) {
    try {
        const db = await dbPromise;
        const sql = `DELETE FROM maps WHERE name = ?`;
        const stmt = db.prepare(sql);
        stmt.run([mapName]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

// Player functions
async function savePlayer(playerId, nickname, playerData = {}) {
    try {
        const db = await dbPromise;
        
        // Generate a new id if playerId is null
        const newPlayerId = playerId || Date.now().toString(36) + Math.random().toString(36).substr(2);
        
        console.log('Saving player:', { newPlayerId, nickname, playerData });
        
        const sql = `
            INSERT OR REPLACE INTO players (id, nickname, data, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `;
        const stmt = db.prepare(sql);
        stmt.run([newPlayerId, nickname, JSON.stringify(playerData)]);
        stmt.free();
        await saveDatabase();
        console.log('Player saved successfully:', newPlayerId);
        return { success: true, id: newPlayerId };
    } catch (err) {
        console.error('Error saving player:', err);
        throw err;
    }
}

async function getPlayer(playerId) {
    try {
        const db = await dbPromise;
        const sql = `SELECT * FROM players WHERE id = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject([playerId]);
        stmt.free();
        if (result && result.id) {
            return {
                id: result.id,
                nickname: result.nickname,
                data: JSON.parse(result.data || '{}'),
                createdAt: result.created_at,
                updatedAt: result.updated_at
            };
        } else {
            return null;
        }
    } catch (err) {
        throw err;
    }
}

async function getPlayerByNickname(nickname) {
    try {
        const db = await dbPromise;
        const sql = `SELECT * FROM players WHERE nickname = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject([nickname]);
        stmt.free();
        if (result && result.id) {
            return {
                id: result.id,
                nickname: result.nickname,
                data: JSON.parse(result.data || '{}'),
                createdAt: result.created_at,
                updatedAt: result.updated_at
            };
        } else {
            return null;
        }
    } catch (err) {
        throw err;
    }
}

async function getAllNicknames() {
    try {
        const db = await dbPromise;
        const sql = `SELECT nickname FROM players`;
        const stmt = db.prepare(sql);
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push(row.nickname);
        }
        stmt.free();
        return results;
    } catch (err) {
        throw err;
    }
}

async function deletePlayer(playerId) {
    try {
        const db = await dbPromise;
        const sql = `DELETE FROM players WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run([playerId]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

// Account functions
async function registerAccount(username, password) {
    try {
        const db = await dbPromise;
        // Check if account already exists
        const existing = await getAccount(username);
        if (existing) {
            return { success: false, message: 'Username already exists' };
        }
        const sql = `
            INSERT INTO accounts (username, password, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `;
        const stmt = db.prepare(sql);
        stmt.run([username, password]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        console.error('Error registering account:', err);
        return { success: false, message: err.message };
    }
}

async function loginAccount(username, password) {
    try {
        const db = await dbPromise;
        const sql = `SELECT * FROM accounts WHERE username = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject([username]);
        stmt.free();
        if (result && result.username) {
            if (result.password === password) {
                return { success: true, username: result.username };
            } else {
                return { success: false, message: 'Incorrect password' };
            }
        } else {
            return { success: false, message: 'User not found' };
        }
    } catch (err) {
        console.error('Error logging in:', err);
        return { success: false, message: err.message };
    }
}

async function updateAccountPassword(username, newPassword) {
    try {
        const db = await dbPromise;
        const sql = `
            UPDATE accounts SET password = ?, updated_at = CURRENT_TIMESTAMP
            WHERE username = ?
        `;
        const stmt = db.prepare(sql);
        stmt.run([newPassword, username]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        console.error('Error updating password:', err);
        return { success: false, message: err.message };
    }
}

async function deleteAccount(username) {
    try {
        const db = await dbPromise;
        const sql = `DELETE FROM accounts WHERE username = ?`;
        const stmt = db.prepare(sql);
        stmt.run([username]);
        stmt.free();
        await saveDatabase();
        return { success: true };
    } catch (err) {
        console.error('Error deleting account:', err);
        return { success: false, message: err.message };
    }
}

async function getAccount(username) {
    try {
        const db = await dbPromise;
        const sql = `SELECT * FROM accounts WHERE username = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject([username]);
        stmt.free();
        if (result && result.username) {
            return {
                username: result.username,
                createdAt: result.created_at,
                updatedAt: result.updated_at
            };
        } else {
            return null;
        }
    } catch (err) {
        console.error('Error getting account:', err);
        return null;
    }
}

async function getAllAccounts() {
    try {
        const db = await dbPromise;
        const sql = `SELECT username FROM accounts`;
        const stmt = db.prepare(sql);
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push(row.username);
        }
        stmt.free();
        return results;
    } catch (err) {
        console.error('Error getting all accounts:', err);
        return [];
    }

}


// Export functions
module.exports = {
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
    // Account functions
    registerAccount,
    loginAccount,
    updateAccountPassword,
    deleteAccount,
    getAccount,
    getAllAccounts,
    // Friend functions
    getPlayerFriends,
    addFriend,
    removeFriend,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    getFriendRequests,
    isFriend,
    dbPromise // Export dbPromise for direct access if needed
};

// Friend functions
async function getPlayerFriends(username) {
    try {
        const player = await getPlayerByNickname(username);
        if (!player) return { friends: [], followers: [], following: [], friendRequests: [], sentRequests: [], bestFriends: [], blockedUsers: [] };
        return player.data.friends || { friends: [], followers: [], following: [], friendRequests: [], sentRequests: [], bestFriends: [], blockedUsers: [] };
    } catch (err) {
        console.error('Error getting player friends:', err);
        return { friends: [], followers: [], following: [], friendRequests: [], sentRequests: [], bestFriends: [], blockedUsers: [] };
    }
}

async function addFriend(username1, username2) {
    try {
        const player1 = await getPlayerByNickname(username1);
        const player2 = await getPlayerByNickname(username2);
        if (!player1 || !player2) return { success: false, message: 'User not found' };

        player1.data = player1.data || {};
        player1.data.friends = player1.data.friends || [];
        player1.data.bestFriends = player1.data.bestFriends || [];
        
        player2.data = player2.data || {};
        player2.data.friends = player2.data.friends || [];
        player2.data.bestFriends = player2.data.bestFriends || [];

        if (!player1.data.friends.includes(username2)) {
            player1.data.friends.push(username2);
        }
        if (!player2.data.friends.includes(username1)) {
            player2.data.friends.push(username1);
        }

        player1.data.friendRequests = player1.data.friendRequests || [];
        player1.data.friendRequests = player1.data.friendRequests.filter(u => u !== username2);
        player2.data.sentRequests = player2.data.sentRequests || [];
        player2.data.sentRequests = player2.data.sentRequests.filter(u => u !== username1);

        await savePlayer(player1.id, player1.nickname, JSON.stringify(player1.data));
        await savePlayer(player2.id, player2.nickname, JSON.stringify(player2.data));

        return { success: true };
    } catch (err) {
        console.error('Error adding friend:', err);
        return { success: false, message: err.message };
    }
}

async function removeFriend(username1, username2) {
    try {
        const player1 = await getPlayerByNickname(username1);
        const player2 = await getPlayerByNickname(username2);
        if (!player1 || !player2) return { success: false, message: 'User not found' };

        player1.data = player1.data || {};
        player1.data.friends = player1.data.friends || [];
        player1.data.bestFriends = player1.data.bestFriends || [];
        
        player2.data = player2.data || {};
        player2.data.friends = player2.data.friends || [];
        player2.data.bestFriends = player2.data.bestFriends || [];

        player1.data.friends = player1.data.friends.filter(u => u !== username2);
        player1.data.bestFriends = player1.data.bestFriends.filter(u => u !== username2);
        player2.data.friends = player2.data.friends.filter(u => u !== username1);
        player2.data.bestFriends = player2.data.bestFriends.filter(u => u !== username1);

        await savePlayer(player1.id, player1.nickname, JSON.stringify(player1.data));
        await savePlayer(player2.id, player2.nickname, JSON.stringify(player2.data));

        return { success: true };
    } catch (err) {
        console.error('Error removing friend:', err);
        return { success: false, message: err.message };
    }
}

async function sendFriendRequest(sender, receiver) {
    try {
        // Check if users exist in accounts or players
        const [senderAccount, receiverAccount, senderPlayer, receiverPlayer] = await Promise.all([
            getAccount(sender),
            getAccount(receiver),
            getPlayerByNickname(sender),
            getPlayerByNickname(receiver)
        ]);
        
        if (!senderAccount && !senderPlayer) {
            return { success: false, message: 'User not found' };
        }
        if (!receiverAccount && !receiverPlayer) {
            return { success: false, message: 'User not found' };
        }
        
        // Get or create player profiles for both users
        let senderPlayerData = senderPlayer ? senderPlayer.data : {};
        let receiverPlayerData = receiverPlayer ? receiverPlayer.data : {};
        
        senderPlayerData.sentRequests = senderPlayerData.sentRequests || [];
        receiverPlayerData.friendRequests = receiverPlayerData.friendRequests || [];

        if (senderPlayerData.sentRequests.includes(receiver)) {
            return { success: false, message: 'Request already sent' };
        }
        if (receiverPlayerData.friendRequests.includes(sender)) {
            return { success: false, message: 'Request already received' };
        }

        senderPlayerData.sentRequests.push(receiver);
        receiverPlayerData.friendRequests.push(sender);

        // Save sender's player data if player exists
        if (senderPlayer) {
            await savePlayer(senderPlayer.id, senderPlayer.nickname, JSON.stringify(senderPlayerData));
        }
        
        // Create or update receiver's player data
        if (receiverPlayer) {
            await savePlayer(receiverPlayer.id, receiverPlayer.nickname, JSON.stringify(receiverPlayerData));
        } else if (receiverAccount) {
            // Create a new player profile for the receiver
            const newPlayer = {
                nickname: receiver,
                data: receiverPlayerData
            };
            await savePlayer(null, receiver, JSON.stringify(receiverPlayerData));
        }

        return { success: true, message: 'Friend request sent!' };
    } catch (err) {
        console.error('Error sending friend request:', err);
        return { success: false, message: err.message };
    }
}

async function acceptFriendRequest(accepter, sender) {
    try {
        // Check if users exist in accounts or players
        const [accepterAccount, senderAccount, accepterPlayer, senderPlayer] = await Promise.all([
            getAccount(accepter),
            getAccount(sender),
            getPlayerByNickname(accepter),
            getPlayerByNickname(sender)
        ]);
        
        if (!accepterAccount && !accepterPlayer) {
            return { success: false, message: 'User not found' };
        }
        if (!senderAccount && !senderPlayer) {
            return { success: false, message: 'User not found' };
        }
        
        // Get or create player data
        let accepterPlayerData = accepterPlayer ? accepterPlayer.data : {};
        let senderPlayerData = senderPlayer ? senderPlayer.data : {};
        
        accepterPlayerData.friends = accepterPlayerData.friends || [];
        accepterPlayerData.friendRequests = accepterPlayerData.friendRequests || [];
        senderPlayerData.friends = senderPlayerData.friends || [];
        senderPlayerData.sentRequests = senderPlayerData.sentRequests || [];

        if (!accepterPlayerData.friends.includes(sender)) {
            accepterPlayerData.friends.push(sender);
        }
        if (!senderPlayerData.friends.includes(accepter)) {
            senderPlayerData.friends.push(accepter);
        }

        accepterPlayerData.friendRequests = accepterPlayerData.friendRequests.filter(u => u !== sender);
        senderPlayerData.sentRequests = senderPlayerData.sentRequests.filter(u => u !== accepter);

        // Save player data if players exist
        if (accepterPlayer) {
            await savePlayer(accepterPlayer.id, accepterPlayer.nickname, JSON.stringify(accepterPlayerData));
        }
        if (senderPlayer) {
            await savePlayer(senderPlayer.id, senderPlayer.nickname, JSON.stringify(senderPlayerData));
        }

        return { success: true, message: 'Friend request accepted!' };
    } catch (err) {
        console.error('Error accepting friend request:', err);
        return { success: false, message: err.message };
    }
}

async function declineFriendRequest(decliner, sender) {
    try {
        // Check if users exist in accounts or players
        const [declinerAccount, senderAccount, declinerPlayer, senderPlayer] = await Promise.all([
            getAccount(decliner),
            getAccount(sender),
            getPlayerByNickname(decliner),
            getPlayerByNickname(sender)
        ]);
        
        if (!declinerAccount && !declinerPlayer) {
            return { success: false, message: 'User not found' };
        }
        if (!senderAccount && !senderPlayer) {
            return { success: false, message: 'User not found' };
        }
        
        // Get or create player data
        let declinerPlayerData = declinerPlayer ? declinerPlayer.data : {};
        let senderPlayerData = senderPlayer ? senderPlayer.data : {};
        
        declinerPlayerData.friendRequests = declinerPlayerData.friendRequests || [];
        senderPlayerData.sentRequests = senderPlayerData.sentRequests || [];

        declinerPlayerData.friendRequests = declinerPlayerData.friendRequests.filter(u => u !== sender);
        senderPlayerData.sentRequests = senderPlayerData.sentRequests.filter(u => u !== decliner);

        // Save player data if players exist
        if (declinerPlayer) {
            await savePlayer(declinerPlayer.id, declinerPlayer.nickname, JSON.stringify(declinerPlayerData));
        }
        if (senderPlayer) {
            await savePlayer(senderPlayer.id, senderPlayer.nickname, JSON.stringify(senderPlayerData));
        }

        return { success: true, message: 'Friend request declined!' };
    } catch (err) {
        console.error('Error declining friend request:', err);
        return { success: false, message: err.message };
    }
}

async function cancelFriendRequest(sender, receiver) {
    try {
        // Check if users exist in accounts or players
        const [senderAccount, receiverAccount, senderPlayer, receiverPlayer] = await Promise.all([
            getAccount(sender),
            getAccount(receiver),
            getPlayerByNickname(sender),
            getPlayerByNickname(receiver)
        ]);
        
        if (!senderAccount && !senderPlayer) {
            return { success: false, message: 'User not found' };
        }
        if (!receiverAccount && !receiverPlayer) {
            return { success: false, message: 'User not found' };
        }
        
        // Get or create player data
        let senderPlayerData = senderPlayer ? senderPlayer.data : {};
        let receiverPlayerData = receiverPlayer ? receiverPlayer.data : {};
        
        senderPlayerData.sentRequests = senderPlayerData.sentRequests || [];
        receiverPlayerData.friendRequests = receiverPlayerData.friendRequests || [];

        senderPlayerData.sentRequests = senderPlayerData.sentRequests.filter(u => u !== receiver);
        receiverPlayerData.friendRequests = receiverPlayerData.friendRequests.filter(u => u !== sender);

        // Save player data if players exist
        if (senderPlayer) {
            await savePlayer(senderPlayer.id, senderPlayer.nickname, JSON.stringify(senderPlayerData));
        }
        if (receiverPlayer) {
            await savePlayer(receiverPlayer.id, receiverPlayer.nickname, JSON.stringify(receiverPlayerData));
        }

        return { success: true, message: 'Friend request canceled!' };
    } catch (err) {
        console.error('Error canceling friend request:', err);
        return { success: false, message: err.message };
    }
}

async function getFriendRequests(username) {
    try {
        const player = await getPlayerByNickname(username);
        if (!player) return { friendRequests: [], sentRequests: [] };
        return {
            friendRequests: player.data.friendRequests || [],
            sentRequests: player.data.sentRequests || []
        };
    } catch (err) {
        console.error('Error getting friend requests:', err);
        return { friendRequests: [], sentRequests: [] };
    }
}

async function isFriend(username1, username2) {
    try {
        const player1 = await getPlayerByNickname(username1);
        if (!player1) return false;
        return (player1.data.friends || []).includes(username2);
    } catch (err) {
        console.error('Error checking friendship:', err);
        return false;
    }
}
