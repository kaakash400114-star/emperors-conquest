/**
 * main.js — Entry Point
 *
 * The simplest file. Creates the Game, patches the renderer to
 * handle menu/overlay screens, and starts the loop.
 */

import { Game } from './game.js';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas);

    // Patch renderer to draw game-state overlays (menu, empire select, etc.)
    const origRender = game.renderer.render.bind(game.renderer);
    game.renderer.render = function () {
        origRender();

        const ctx = game.ctx;
        const { width, height } = game;

        switch (game.state) {
            case 'menu':
                game.drawMenu(ctx, width, height);
                break;
            case 'empireSelect':
                game.drawEmpireSelect(ctx, width, height);
                break;
            case 'gameover':
                game.drawGameOver(ctx, width, height);
                break;
            case 'victory':
                game.drawVictory(ctx, width, height);
                break;
        }
    };

    game.start();
});
