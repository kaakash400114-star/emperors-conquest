// ── Emperor's Conquest — Online Client Module ──

export class OnlineClient {
    constructor(game) {
        this.g = game;
        this.ws = null;
        this.connected = false;
        this.roomCode = null;
        this.playerId = null;
        this.playerName = 'General_' + Math.random().toString(36).substring(2, 6);
        this.roomPlayers = [];
        this.messages = [];
        this.globalMessages = [];
        this.leaderboard = [];
        this.achievements = [];
        this.pendingRequests = []; // alliance/trade/diplomacy requests
        this._reconnectTimer = null;
        this._messageQueue = [];
    }

    get serverUrl() {
        return `ws://${window.location.host}`;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        try {
            this.ws = new WebSocket(this.serverUrl);
            this.ws.onopen = () => {
                this.connected = true;
                this.g._wsConnected = true;
                this.g._log('Connected to server!');
                // Flush queued messages
                for (const msg of this._messageQueue) {
                    this.send(msg);
                }
                this._messageQueue = [];
            };
            this.ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    this._handleMessage(msg);
                } catch (err) {
                    console.warn('WebSocket parse error:', err);
                }
            };
            this.ws.onclose = () => {
                this.connected = false;
                this.g._wsConnected = false;
                this.g._log('Disconnected from server');
                // Auto reconnect after 3s
                this._reconnectTimer = setTimeout(() => this.connect(), 3000);
            };
            this.ws.onerror = () => {
                this.connected = false;
                this.g._wsConnected = false;
            };
        } catch {
            this.g._wsConnected = false;
        }
    }

    disconnect() {
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        if (this.ws) {
            this.ws.onclose = null; // prevent reconnect
            this.ws.close();
        }
        this.connected = false;
        this.g._wsConnected = false;
    }

    send(msg) {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        } else {
            this._messageQueue.push(msg);
        }
    }

    createRoom(name) {
        this.send({ type: 'createRoom', roomName: name, playerName: this.playerName });
    }

    joinRoom(code) {
        this.send({ type: 'joinRoom', code: code.toUpperCase(), playerName: this.playerName });
    }

    quickMatch() {
        this.send({ type: 'quickMatch', playerName: this.playerName });
    }

    leaveRoom() {
        this.send({ type: 'leaveRoom' });
        this.roomCode = null;
        this.roomPlayers = [];
        this.messages = [];
    }

    selectEmpire(empireId) {
        this.send({ type: 'selectEmpire', empire: empireId });
    }

    startGame(difficulty) {
        this.send({ type: 'startGame', difficulty });
    }

    sendChat(text, scope) {
        this.send({ type: 'chat', text, scope: scope || 'room' });
    }

    syncGameState(state, turn) {
        this.send({ type: 'syncState', gameState: state, turn });
    }

    gameAction(action, data) {
        this.send({ type: 'gameAction', action, data });
    }

    endTurn() {
        this.send({ type: 'endTurn' });
    }

    // ── Alliance ──
    requestAlliance(targetId) {
        this.send({ type: 'allianceRequest', targetId });
    }

    respondAlliance(fromId, accepted) {
        this.send({ type: 'allianceResponse', fromId, accepted });
    }

    breakAlliance(targetId) {
        this.send({ type: 'breakAlliance', targetId });
    }

    // ── Trade ──
    requestTrade(targetId, offer, request) {
        this.send({ type: 'tradeRequest', targetId, offer, request });
    }

    respondTrade(tradeId, accepted) {
        this.send({ type: 'tradeResponse', tradeId, accepted });
    }

    // ── Spy ──
    sendSpy(targetId, territoryId) {
        this.send({ type: 'spySend', targetId, territory: territoryId });
    }

    // ── Diplomacy ──
    sendDiplomacy(targetId, diploType, message) {
        this.send({ type: 'diplomacy', targetId, diploType, message });
    }

    respondDiplomacy(diplomacyId, accepted) {
        this.send({ type: 'diplomacyResponse', diplomacyId, accepted });
    }

    // ── Battle Events ──
    battleEvent(event, territory, data) {
        this.send({ type: 'battleEvent', event, territory, data });
    }

    // ── Message Handler ──
    _handleMessage(msg) {
        const g = this.g;

        switch (msg.type) {
            case 'welcome':
                this.leaderboard = msg.leaderboard || [];
                this.globalMessages = msg.globalChat || [];
                g._lobbyRooms = msg.rooms || [];
                break;

            case 'roomsUpdated':
                g._lobbyRooms = msg.rooms || [];
                break;

            case 'roomCreated':
                this.roomCode = msg.code;
                this.playerId = msg.playerId;
                this.roomPlayers = msg.players || [];
                g._roomCode = msg.code;
                g._log('Room created: ' + msg.code);
                break;

            case 'roomJoined':
            case 'quickMatched':
                this.roomCode = msg.code;
                this.playerId = msg.playerId;
                this.roomPlayers = msg.players || [];
                g._roomCode = msg.code;
                g._log('Joined room: ' + msg.code);
                // Move to empire selection
                g.state = 'empireSelect';
                g.sfx.click();
                break;

            case 'playerJoined':
                this.roomPlayers = msg.players || this.roomPlayers;
                g._log(msg.player.name + ' joined the room');
                break;

            case 'playerLeft':
                this.roomPlayers = msg.players || this.roomPlayers;
                g._log('A player left the room');
                break;

            case 'empireSelected':
                this.roomPlayers = msg.players || this.roomPlayers;
                break;

            case 'gameStarted':
                g._log('Game started! Difficulty: ' + msg.difficulty);
                g.difficulty = msg.difficulty;
                g._startGame(g.player);
                break;

            case 'stateUpdate':
                // Another player updated the game state
                g._log('Game state synced');
                break;

            case 'turnChanged':
                g._log('Turn ' + msg.turn);
                break;

            case 'chat':
                if (msg.scope === 'global') {
                    this.globalMessages.push(msg);
                    if (this.globalMessages.length > 50) this.globalMessages.shift();
                } else {
                    this.messages.push(msg);
                    if (this.messages.length > 50) this.messages.shift();
                }
                break;

            case 'chatHistory':
                this.messages = msg.messages || [];
                break;

            case 'allianceRequest':
                this.pendingRequests.push({ type: 'alliance', from: msg.from, fromName: msg.fromName });
                g._log(msg.fromName + ' wants to form an alliance!');
                break;

            case 'tradeRequest':
                this.pendingRequests.push({ type: 'trade', ...msg.trade });
                g._log(msg.trade.fromName + ' sent a trade request');
                break;

            case 'diplomacy':
                this.pendingRequests.push({ type: 'diplomacy', ...msg.diplomacy });
                g._log(msg.diplomacy.fromName + ' sent a diplomatic ' + msg.diplomacy.diploType);
                break;

            case 'achievement':
                this.achievements.push(msg.achievement);
                g._log('Achievement unlocked: ' + msg.achievement.name + '!');
                g.sfx.buy();
                break;

            case 'leaderboardUpdated':
                this.leaderboard = msg.leaderboard || [];
                break;

            case 'error':
                g._log('Error: ' + msg.error);
                g.sfx.error();
                break;

            case 'gameOver':
                g._log((msg.winnerName || 'Someone') + ' won the game!');
                break;
        }
    }
}
