/**
 * input.js — Pointer input handler.
 * FIX: Uses canvas-relative coordinates via getBoundingClientRect().
 * Added: pointer held state (isDown), pointer tracking for joystick/fire controls.
 */
export class Input {
    constructor(game) {
        this.game = game;
        this.sx = 0; this.sy = 0;
        this.hoverX = 0; this.hoverY = 0;
        this._clicked = false;
        this._consumed = false;
        this.keys = []; // keyboard keys pressed this frame
        this._keyBuffer = [];

        // Pointer held state for joystick / fire controls
        this.isDown = false;
        this.curX = 0; this.curY = 0; // current pointer pos while held

        const c = document.getElementById('ui');

        const canvasCoords = (e) => {
            const rect = c.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (c.width / rect.width),
                y: (e.clientY - rect.top) * (c.height / rect.height)
            };
        };

        c.addEventListener('pointerdown', (e) => {
            const p = canvasCoords(e);
            this.sx = p.x;
            this.sy = p.y;
            this.curX = p.x;
            this.curY = p.y;
            this._clicked = true;
            this._consumed = false;
            this.isDown = true;
            // Initialize audio on first user interaction (browser autoplay policy)
            this._initAudio();
        });

        c.addEventListener('pointermove', (e) => {
            const p = canvasCoords(e);
            this.hoverX = p.x;
            this.hoverY = p.y;
            if (this.isDown) {
                this.curX = p.x;
                this.curY = p.y;
            }
        });

        c.addEventListener('pointerup', () => {
            this.isDown = false;
        });

        c.addEventListener('pointerleave', () => {
            this.isDown = false;
        });

        // Also listen for touchstart as some mobile browsers need this specifically
        c.addEventListener('touchstart', (e) => {
            this._initAudio();
        }, { passive: true });

        // Keyboard input
        window.addEventListener('keydown', (e) => {
            this._keyBuffer.push(e.key);
            // Route keyboard to renderer for country search
            if (this.game && this.game.renderer && this.game.renderer._empSelKey &&
                (this.game.state === 'empireSelect' || this.game.state === 'countrySelect')) {
                this.game.renderer._empSelKey(e);
            }
        });
        // Mouse wheel for country list scrolling
        window.addEventListener('wheel', (e) => {
            const st = this.game && this.game.state;
            if (this.game && (st === 'empireSelect' || st === 'countrySelect') && this.game.renderer._cs) {
                this.game.renderer._cs.scroll += e.deltaY * 0.5;
                e.preventDefault();
            }
        }, { passive: false });

        // Touch support — prevent scrolling/zooming on mobile
        c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    }

    hasClick() { return this._clicked && !this._consumed; }
    consumeClick() { this._consumed = true; }

    _initAudio() {
        const g = this.game;
        try {
            if (g.sfx) g.sfx._ensure();
            if (g.sound) {
                g.sound.init();
                if (g.sound.ctx && g.sound.ctx.state === 'suspended') {
                    const p = g.sound.ctx.resume();
                    if (p && p.then) p.catch(() => {});
                }
            }
        } catch(e) { console.warn('Audio init:', e); }
    }

    getTypedKeys() { const k = this._keyBuffer; this._keyBuffer = []; return k; }
    isKeyDown(key) { return this._keysDown.has(key); }
    endFrame() {
        if (this._consumed) this._clicked = false;
        this.keys = this._keyBuffer;
        this._keyBuffer = [];
    }
}
