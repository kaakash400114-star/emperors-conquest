import { Game } from './game.js';

const canvas = document.getElementById('c');
const game = new Game(canvas);
game.start();
self.__game = game;
