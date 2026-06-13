// roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
        const r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.arcTo(x + w, y, x + w, y + r, r);
        this.lineTo(x + w, y + h - r);
        this.arcTo(x + w, y + h, x + w - r, y + h, r);
        this.lineTo(x + r, y + h);
        this.arcTo(x, y + h, x + y - r, y + r);
        this.closePath();
        return this;
    };
}

import { Game } from './game.js';
import { OnlineClient } from './online.js';
import { sound } from './sound.js';

const glCanvas = document.getElementById('gl');
const uiCanvas = document.getElementById('ui');
const game = new Game(glCanvas, uiCanvas);
game.online = new OnlineClient(game);
game.sound = sound;
game.start();
self.__game = game;
