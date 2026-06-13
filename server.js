// ── Emperor's Conquest — Online Multiplayer Server ──
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 9001;

// ── Static file server ──
const httpServer = createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    // Strip query params
    filePath = filePath.split('?')[0];
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
        'html': 'text/html', 'js': 'application/javascript', 'css': 'text/css',
        'json': 'application/json', 'png': 'image/png', 'jpg': 'image/jpeg',
        'svg': 'image/svg+xml', 'ico': 'image/x-icon', 'wasm': 'application/wasm',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    try {
        const content = readFileSync(join(__dirname, filePath));
        // No-cache headers to prevent stale browser cache during development
        res.writeHead(200, {
            'Content-Type': mimeType,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.end(content);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});

// ── WebSocket Server ──
const wss = new WebSocketServer({ server: httpServer });

// ── Game State ──
const rooms = new Map();       // code -> Room
const players = new Map();     // ws -> Player
const leaderboard = new Map(); // name -> Stats
const globalChat = [];         // last 100 messages

function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function genId() {
    return Math.random().toString(36).substring(2, 10);
}

// ── Room Management ──
function createRoom(ws, name) {
    const code = genCode();
    const room = {
        code,
        name: name || 'Conquest Room',
        host: ws,
        players: new Map(), // ws -> { id, name, empire, ready }
        state: 'lobby',     // lobby, playing, finished
        gameState: null,    // serialized game state
        chat: [],
        alliances: [],      // [{members: [p1id, p2id]}]
        trades: [],         // [{from, to, offer, request, status}]
        diplomacy: [],      // [{from, to, type, status}]
        turn: 0,
        maxPlayers: 10,
        difficulty: 'normal',
        createdAt: Date.now(),
    };
    rooms.set(code, room);
    return room;
}

function joinRoom(ws, code, playerName) {
    const room = rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.players.size >= room.maxPlayers) return { ok: false, error: 'Room is full' };
    if (room.state === 'playing') return { ok: false, error: 'Game already in progress' };

    const pid = genId();
    room.players.set(ws, {
        id: pid,
        name: playerName || 'General_' + pid.substring(0, 4),
        empire: null,
        ready: false,
        joinedAt: Date.now(),
    });

    // Notify all players
    broadcastRoom(room, {
        type: 'playerJoined',
        player: { id: pid, name: playerName },
        playerCount: room.players.size,
    });

    return { ok: true, roomCode: code, playerId: pid, players: getRoomPlayers(room) };
}

function getRoomPlayers(room) {
    const list = [];
    for (const [w, p] of room.players) {
        list.push({ id: p.id, name: p.name, empire: p.empire, ready: p.ready });
    }
    return list;
}

function getPublicRooms() {
    const list = [];
    for (const [code, room] of rooms) {
        list.push({
            code,
            name: room.name,
            players: room.players.size,
            maxPlayers: room.maxPlayers,
            state: room.state,
        });
    }
    return list;
}

function broadcastRoom(room, msg) {
    const data = JSON.stringify(msg);
    for (const [ws] of room.players) {
        if (ws.readyState === 1) ws.send(data);
    }
}

function broadcastGlobal(msg) {
    const data = JSON.stringify(msg);
    for (const [ws] of players) {
        if (ws.readyState === 1) ws.send(data);
    }
}

// ── Leaderboard ──
function updateLeaderboard(name, field, value) {
    if (!leaderboard.has(name)) {
        leaderboard.set(name, { name, wins: 0, losses: 0, territories: 0, coins: 0, gamesPlayed: 0 });
    }
    const stats = leaderboard.get(name);
    stats[field] = (stats[field] || 0) + value;
    if (field === 'wins' || field === 'losses') stats.gamesPlayed++;
}

function getLeaderboard() {
    return [...leaderboard.values()].sort((a, b) => (b.wins * 100 + b.territories) - (a.wins * 100 + a.territories));
}

// ── Achievements ──
const ACHIEVEMENTS = [
    { id: 'first_blood', name: 'First Blood', desc: 'Win your first battle', icon: '\u{1F5E1}' },
    { id: 'conqueror_5', name: 'Conqueror', desc: 'Own 5 territories', icon: '\u{1F3F4}' },
    { id: 'conqueror_15', name: 'Warlord', desc: 'Own 15 territories', icon: '\u{1F451}' },
    { id: 'conqueror_all', name: 'Emperor', desc: 'Conquer the entire map', icon: '\u{1F451}' },
    { id: 'alliance_3', name: 'Diplomat', desc: 'Form 3 alliances', icon: '\u{1F91D}' },
    { id: 'trade_5', name: 'Merchant', desc: 'Complete 5 trades', icon: '\u{1F4B0}' },
    { id: 'spy_master', name: 'Spy Master', desc: 'Successfully spy 3 times', icon: '\u{1F575}' },
    { id: 'chat_50', name: 'Chatterbox', desc: 'Send 50 chat messages', icon: '\u{1F4AC}' },
    { id: 'win_10', name: 'Veteran', desc: 'Win 10 games', icon: '\u{1F3C6}' },
    { id: 'quick_win', name: 'Lightning Strike', desc: 'Win in under 20 turns', icon: '\u{26A1}' },
];

const playerAchievements = new Map(); // playerId -> Set of achievement ids

function grantAchievement(ws, playerId, achievementId) {
    if (!playerAchievements.has(playerId)) playerAchievements.set(playerId, new Set());
    const earned = playerAchievements.get(playerId);
    if (earned.has(achievementId)) return false;
    earned.add(achievementId);
    const ach = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (ach) {
        ws.send(JSON.stringify({ type: 'achievement', achievement: ach }));
    }
    return true;
}

// ── WebSocket Message Handler ──
wss.on('connection', (ws) => {
    console.log('[+] Player connected');
    players.set(ws, { connectedAt: Date.now() });

    // Send welcome + public rooms
    ws.send(JSON.stringify({
        type: 'welcome',
        rooms: getPublicRooms(),
        leaderboard: getLeaderboard().slice(0, 20),
        globalChat: globalChat.slice(-20),
    }));

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {
            // ── Room Management ──
            case 'createRoom': {
                const room = createRoom(ws, msg.roomName);
                const pid = genId();
                room.players.set(ws, {
                    id: pid,
                    name: msg.playerName || 'Host',
                    empire: null,
                    ready: false,
                    joinedAt: Date.now(),
                });
                players.set(ws, { ...players.get(ws), roomCode: room.code, playerId: pid, playerName: msg.playerName });
                ws.send(JSON.stringify({
                    type: 'roomCreated',
                    code: room.code,
                    playerId: pid,
                    players: getRoomPlayers(room),
                }));
                broadcastGlobal({ type: 'roomsUpdated', rooms: getPublicRooms() });
                console.log(`[Room] ${msg.playerName} created ${room.code}`);
                break;
            }

            case 'joinRoom': {
                const result = joinRoom(ws, msg.code, msg.playerName);
                if (result.ok) {
                    players.set(ws, { ...players.get(ws), roomCode: msg.code, playerId: result.playerId, playerName: msg.playerName });
                    ws.send(JSON.stringify({
                        type: 'roomJoined',
                        code: result.roomCode,
                        playerId: result.playerId,
                        players: result.players,
                    }));
                    // Send existing chat
                    const room = rooms.get(msg.code);
                    if (room && room.chat.length > 0) {
                        ws.send(JSON.stringify({ type: 'chatHistory', messages: room.chat.slice(-30) }));
                    }
                    broadcastGlobal({ type: 'roomsUpdated', rooms: getPublicRooms() });
                    console.log(`[Room] ${msg.playerName} joined ${msg.code}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', error: result.error }));
                }
                break;
            }

            case 'quickMatch': {
                // Find a lobby room with space, or create one
                let matched = null;
                for (const [code, room] of rooms) {
                    if (room.state === 'lobby' && room.players.size < room.maxPlayers && room.players.size > 0) {
                        matched = { code, room };
                        break;
                    }
                }
                if (matched) {
                    const result = joinRoom(ws, matched.code, msg.playerName);
                    if (result.ok) {
                        players.set(ws, { ...players.get(ws), roomCode: matched.code, playerId: result.playerId, playerName: msg.playerName });
                        ws.send(JSON.stringify({
                            type: 'quickMatched',
                            code: result.roomCode,
                            playerId: result.playerId,
                            players: result.players,
                        }));
                    }
                } else {
                    // Create new room for them
                    const room = createRoom(ws, 'Quick Match');
                    const pid = genId();
                    room.players.set(ws, {
                        id: pid, name: msg.playerName || 'Player',
                        empire: null, ready: false, joinedAt: Date.now(),
                    });
                    players.set(ws, { ...players.get(ws), roomCode: room.code, playerId: pid, playerName: msg.playerName });
                    ws.send(JSON.stringify({
                        type: 'quickMatched',
                        code: room.code,
                        playerId: pid,
                        players: getRoomPlayers(room),
                    }));
                    broadcastGlobal({ type: 'roomsUpdated', rooms: getPublicRooms() });
                }
                break;
            }

            case 'leaveRoom': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room) {
                        room.players.delete(ws);
                        broadcastRoom(room, {
                            type: 'playerLeft',
                            playerId: pInfo.playerId,
                            playerCount: room.players.size,
                            players: getRoomPlayers(room),
                        });
                        if (room.players.size === 0) {
                            rooms.delete(pInfo.roomCode);
                            console.log(`[Room] ${pInfo.roomCode} deleted (empty)`);
                        }
                        broadcastGlobal({ type: 'roomsUpdated', rooms: getPublicRooms() });
                    }
                    delete pInfo.roomCode;
                    delete pInfo.playerId;
                    players.set(ws, pInfo);
                }
                break;
            }

            case 'selectEmpire': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room) {
                        const p = room.players.get(ws);
                        if (p) {
                            p.empire = msg.empire;
                            p.ready = true;
                            broadcastRoom(room, {
                                type: 'empireSelected',
                                playerId: pInfo.playerId,
                                empire: msg.empire,
                                players: getRoomPlayers(room),
                            });
                        }
                    }
                }
                break;
            }

            case 'startGame': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'lobby' && room.players.size >= 2) {
                        room.state = 'playing';
                        room.turn = 1;
                        room.difficulty = msg.difficulty || 'normal';
                        broadcastRoom(room, {
                            type: 'gameStarted',
                            difficulty: room.difficulty,
                            turn: room.turn,
                            players: getRoomPlayers(room),
                        });
                        console.log(`[Game] Room ${room.code} started!`);
                    }
                }
                break;
            }

            // ── Game State Sync ──
            case 'gameAction': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'playing') {
                        // Relay action to all other players in room
                        broadcastRoom(room, {
                            type: 'gameAction',
                            playerId: pInfo.playerId,
                            action: msg.action,
                            data: msg.data,
                        });
                    }
                }
                break;
            }

            case 'syncState': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'playing') {
                        room.gameState = msg.gameState;
                        room.turn = msg.turn || room.turn;
                        // Relay to other players
                        for (const [w] of room.players) {
                            if (w !== ws && w.readyState === 1) {
                                w.send(JSON.stringify({
                                    type: 'stateUpdate',
                                    playerId: pInfo.playerId,
                                    gameState: msg.gameState,
                                    turn: room.turn,
                                }));
                            }
                        }
                    }
                }
                break;
            }

            case 'endTurn': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'playing') {
                        room.turn++;
                        broadcastRoom(room, {
                            type: 'turnChanged',
                            turn: room.turn,
                            playerId: pInfo.playerId,
                        });
                    }
                }
                break;
            }

            case 'gameOver': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room) {
                        room.state = 'finished';
                        broadcastRoom(room, {
                            type: 'gameOver',
                            winner: msg.winner,
                            winnerName: msg.winnerName,
                            stats: msg.stats,
                        });
                        // Update leaderboard
                        if (msg.winnerName) {
                            updateLeaderboard(msg.winnerName, 'wins', 1);
                            updateLeaderboard(msg.winnerName, 'territories', msg.stats?.territories || 0);
                            // Grant achievements
                            const pid = pInfo.playerId;
                            grantAchievement(ws, pid, 'conqueror_all');
                            if (room.turn < 20) grantAchievement(ws, pid, 'quick_win');
                            const wins = leaderboard.get(msg.winnerName)?.wins || 0;
                            if (wins >= 10) grantAchievement(ws, pid, 'win_10');
                        }
                        broadcastGlobal({ type: 'leaderboardUpdated', leaderboard: getLeaderboard().slice(0, 20) });
                    }
                }
                break;
            }

            // ── Chat ──
            case 'chat': {
                const pInfo = players.get(ws);
                if (!pInfo) break;
                const chatMsg = {
                    id: genId(),
                    from: pInfo.playerName || 'Unknown',
                    playerId: pInfo.playerId,
                    text: msg.text.substring(0, 200),
                    time: Date.now(),
                    scope: msg.scope || 'room', // 'room' or 'global'
                };

                if (msg.scope === 'global') {
                    globalChat.push(chatMsg);
                    if (globalChat.length > 100) globalChat.shift();
                    broadcastGlobal({ type: 'chat', ...chatMsg });
                    // Achievement tracking
                    if (pInfo._chatCount === undefined) pInfo._chatCount = 0;
                    pInfo._chatCount++;
                    if (pInfo._chatCount >= 50) grantAchievement(ws, pInfo.playerId, 'chat_50');
                } else if (pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room) {
                        room.chat.push(chatMsg);
                        if (room.chat.length > 200) room.chat.shift();
                        broadcastRoom(room, { type: 'chat', ...chatMsg });
                    }
                }
                break;
            }

            // ── Alliance System ──
            case 'allianceRequest': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'playing') {
                        broadcastRoom(room, {
                            type: 'allianceRequest',
                            from: pInfo.playerId,
                            fromName: pInfo.playerName,
                            to: msg.targetId,
                        });
                    }
                }
                break;
            }

            case 'allianceResponse': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'playing') {
                        if (msg.accepted) {
                            room.alliances.push({
                                members: [pInfo.playerId, msg.fromId],
                                createdAt: Date.now(),
                            });
                            // Achievement
                            const myAlliances = room.alliances.filter(a => a.members.includes(pInfo.playerId)).length;
                            if (myAlliances >= 3) grantAchievement(ws, pInfo.playerId, 'alliance_3');
                        }
                        broadcastRoom(room, {
                            type: 'allianceResponse',
                            fromId: msg.fromId,
                            from: pInfo.playerId,
                            accepted: msg.accepted,
                        });
                    }
                }
                break;
            }

            case 'breakAlliance': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room) {
                        room.alliances = room.alliances.filter(a =>
                            !(a.members.includes(pInfo.playerId) && a.members.includes(msg.targetId))
                        );
                        broadcastRoom(room, {
                            type: 'allianceBroken',
                            player1: pInfo.playerId,
                            player2: msg.targetId,
                        });
                    }
                }
                break;
            }

            // ── Trade System ──
            case 'tradeRequest': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'playing') {
                        const trade = {
                            id: genId(),
                            from: pInfo.playerId,
                            fromName: pInfo.playerName,
                            to: msg.targetId,
                            offer: msg.offer,     // {troops, coins, weapon}
                            request: msg.request,  // {troops, coins, weapon}
                            status: 'pending',
                        };
                        room.trades.push(trade);
                        broadcastRoom(room, {
                            type: 'tradeRequest',
                            trade,
                        });
                    }
                }
                break;
            }

            case 'tradeResponse': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room) {
                        const trade = room.trades.find(t => t.id === msg.tradeId);
                        if (trade && trade.to === pInfo.playerId) {
                            trade.status = msg.accepted ? 'accepted' : 'rejected';
                            broadcastRoom(room, {
                                type: 'tradeResponse',
                                tradeId: msg.tradeId,
                                accepted: msg.accepted,
                            });
                            if (msg.accepted) {
                                // Achievement
                                const myTrades = room.trades.filter(t => t.status === 'accepted' && (t.from === pInfo.playerId || t.to === pInfo.playerId)).length;
                                if (myTrades >= 5) grantAchievement(ws, pInfo.playerId, 'trade_5');
                            }
                        }
                    }
                }
                break;
            }

            // ── Spy System ──
            case 'spySend': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'playing') {
                        broadcastRoom(room, {
                            type: 'spySent',
                            from: pInfo.playerId,
                            target: msg.targetId,
                            territory: msg.territoryId,
                            success: Math.random() > 0.3, // 70% success rate
                        });
                        // Achievement tracking
                        if (pInfo._spyCount === undefined) pInfo._spyCount = 0;
                        pInfo._spyCount++;
                        if (pInfo._spyCount >= 3) grantAchievement(ws, pInfo.playerId, 'spy_master');
                    }
                }
                break;
            }

            // ── Diplomacy ──
            case 'diplomacy': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room && room.state === 'playing') {
                        const diplo = {
                            id: genId(),
                            from: pInfo.playerId,
                            fromName: pInfo.playerName,
                            to: msg.targetId,
                            diploType: msg.diploType, // 'peace', 'war', 'ultimatum', 'pact'
                            message: msg.message || '',
                            status: 'pending',
                        };
                        room.diplomacy.push(diplo);
                        broadcastRoom(room, {
                            type: 'diplomacy',
                            diplomacy: diplo,
                        });
                    }
                }
                break;
            }

            case 'diplomacyResponse': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room) {
                        const diplo = room.diplomacy.find(d => d.id === msg.diplomacyId);
                        if (diplo) {
                            diplo.status = msg.accepted ? 'accepted' : 'rejected';
                            broadcastRoom(room, {
                                type: 'diplomacyResponse',
                                diplomacyId: msg.diplomacyId,
                                accepted: msg.accepted,
                            });
                        }
                    }
                }
                break;
            }

            // ── Battle Events (for spectator mode) ──
            case 'battleEvent': {
                const pInfo = players.get(ws);
                if (pInfo && pInfo.roomCode) {
                    const room = rooms.get(pInfo.roomCode);
                    if (room) {
                        broadcastRoom(room, {
                            type: 'battleEvent',
                            playerId: pInfo.playerId,
                            event: msg.event, // 'attack', 'victory', 'defeat'
                            territory: msg.territory,
                            data: msg.data,
                        });
                        // Achievement
                        if (msg.event === 'victory') {
                            grantAchievement(ws, pInfo.playerId, 'first_blood');
                        }
                    }
                }
                break;
            }

            // ── Achievement triggers from client ──
            case 'achievementTrigger': {
                const pInfo = players.get(ws);
                if (pInfo) {
                    grantAchievement(ws, pInfo.playerId, msg.achievementId);
                }
                break;
            }

            // ── Request data ──
            case 'getRooms': {
                ws.send(JSON.stringify({ type: 'roomsUpdated', rooms: getPublicRooms() }));
                break;
            }

            case 'getLeaderboard': {
                ws.send(JSON.stringify({ type: 'leaderboardUpdated', leaderboard: getLeaderboard().slice(0, 50) }));
                break;
            }

            case 'getAchievements': {
                const pInfo = players.get(ws);
                if (pInfo) {
                    const earned = playerAchievements.get(pInfo.playerId) || new Set();
                    ws.send(JSON.stringify({
                        type: 'achievements',
                        earned: [...earned],
                        all: ACHIEVEMENTS,
                    }));
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('[-] Player disconnected');
        const pInfo = players.get(ws);
        if (pInfo) {
            // Leave room
            if (pInfo.roomCode) {
                const room = rooms.get(pInfo.roomCode);
                if (room) {
                    room.players.delete(ws);
                    broadcastRoom(room, {
                        type: 'playerLeft',
                        playerId: pInfo.playerId,
                        playerCount: room.players.size,
                        players: getRoomPlayers(room),
                    });
                    if (room.players.size === 0) {
                        rooms.delete(pInfo.roomCode);
                        console.log(`[Room] ${pInfo.roomCode} deleted (empty)`);
                    }
                }
                broadcastGlobal({ type: 'roomsUpdated', rooms: getPublicRooms() });
            }
            players.delete(ws);
        }
    });
});

// ── Start Server ──
httpServer.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  Emperor's Conquest — Online Server`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  WebSocket port: ${PORT}`);
    console.log(`${'='.repeat(50)}\n`);
});

// ── Cleanup stale rooms every 5 minutes ──
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (room.players.size === 0 || (now - room.createdAt > 3600000 && room.state === 'lobby')) {
            rooms.delete(code);
            console.log(`[Cleanup] Room ${code} removed`);
        }
    }
    broadcastGlobal({ type: 'roomsUpdated', rooms: getPublicRooms() });
}, 300000);
