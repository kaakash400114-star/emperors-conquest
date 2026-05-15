/**
 * input.js — Pointer input handler.
 * FIX: Uses canvas-relative coordinates via getBoundingClientRect().
 */
export class Input {
    constructor(game) {
        this.game = game;
        this.sx = 0; this.sy = 0;
        this.hoverX = 0; this.hoverY = 0;
        this._clicked = false;
        this._consumed = false;

        const c = document.getElementById('c');

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
            this._clicked = true;
            this._consumed = false;
        });

        c.addEventListener('pointermove', (e) => {
            const p = canvasCoords(e);
            this.hoverX = p.x;
            this.hoverY = p.y;
        });

        // Touch support — prevent scrolling/zooming on mobile
        c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    }

    hasClick() { return this._clicked && !this._consumed; }
    consumeClick() { this._consumed = true; }
    endFrame() { if (this._consumed) this._clicked = false; }
}
