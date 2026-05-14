export class Input {
    constructor() {
        this.sx = 0; this.sy = 0;
        this.hoverX = 0; this.hoverY = 0;
        this._clicked = false;
        this._consumed = false;

        const c = document.getElementById('c');
        c.addEventListener('pointerdown', (e) => {
            this.sx = e.clientX;
            this.sy = e.clientY;
            this._clicked = true;
            this._consumed = false;
        });
        c.addEventListener('pointermove', (e) => {
            this.hoverX = e.clientX;
            this.hoverY = e.clientY;
        });
    }

    hasClick() { return this._clicked && !this._consumed; }
    consumeClick() { this._consumed = true; }
    endFrame() { if (this._consumed) this._clicked = false; }
}
