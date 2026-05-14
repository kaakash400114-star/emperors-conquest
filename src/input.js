/**
 * input.js — Input Handler
 *
 * Converts mouse clicks and touch taps into game actions.
 * On desktop: click to interact. On mobile: tap to interact.
 *
 * The input system reports:
 *   - click position (in screen coordinates)
 *   - hover position (desktop only)
 *   - which territory was clicked/hovered (in map coordinates)
 *
 * The Game class reads these each frame and decides what to do.
 * Input doesn't make game decisions — it only reports what happened.
 */

export class Input {
    constructor(game) {
        this.game = game;
        this.screenX = 0;
        this.screenY = 0;
        this.hoverX = 0;
        this.hoverY = 0;
        this.clicked = false;       // Was there a click this frame?
        this.clickConsumed = false;  // Has the game processed the click?

        this._setupMouse();
        this._setupTouch();
    }

    _setupMouse() {
        const canvas = this.game.canvas;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.hoverX = e.clientX - rect.left;
            this.hoverY = e.clientY - rect.top;
        });

        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.screenX = e.clientX - rect.left;
            this.screenY = e.clientY - rect.top;
            this.clicked = true;
            this.clickConsumed = false;
        });
    }

    _setupTouch() {
        const canvas = this.game.canvas;
        let lastTap = 0;

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            this.screenX = touch.clientX - rect.left;
            this.screenY = touch.clientY - rect.top;
            this.hoverX = this.screenX;
            this.hoverY = this.screenY;

            // Debounce rapid taps
            const now = Date.now();
            if (now - lastTap > 150) {
                this.clicked = true;
                this.clickConsumed = false;
            }
            lastTap = now;
        }, { passive: false });
    }

    /** Consume the click (prevents double-processing) */
    consumeClick() {
        this.clickConsumed = true;
    }

    /** Was there a click that hasn't been consumed yet? */
    hasClick() {
        return this.clicked && !this.clickConsumed;
    }

    /** Clear the click flag at end of frame */
    endFrame() {
        this.clicked = false;
        this.clickConsumed = false;
    }
}
