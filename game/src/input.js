// Neon Bay — keyboard and mouse. WASD to move/drive, mouse to look (pointer
// lock, with drag-to-look and arrow-key fallback), E to enter/steal a car,
// Space to brake/handbrake, F to punch, R to reload, Esc/P to pause, M to
// mute. Edge-triggered actions are consumed once per press.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last consume
    this.lookDX = 0;
    this.lookDY = 0;
    this.locked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('click', () => {
      if (!this.locked && !document.pointerLockElement) {
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.lookDX += e.movementX || 0;
        this.lookDY += e.movementY || 0;
      } else if (this.dragging) {
        this.lookDX += e.clientX - this.lastX;
        this.lookDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // Held state lives in `keys` (firing while held); the edge lives in
        // `pressed` for actions that consume one press.
        this.keys.add('Mouse0');
        this.pressed.add('Mouse0');
      }
      if (!this.locked && e.button === 0) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.dragging = false;
        this.keys.delete('Mouse0');
      }
    });
  }

  get forward() {
    return this.keys.has('KeyW') || this.keys.has('ArrowUp');
  }
  get back() {
    return this.keys.has('KeyS') || this.keys.has('ArrowDown');
  }
  get left() {
    return this.keys.has('KeyA') || this.keys.has('ArrowLeft');
  }
  get right() {
    return this.keys.has('KeyD') || this.keys.has('ArrowRight');
  }
  get sprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
  get handbrake() {
    return this.keys.has('Space');
  }

  // True once per physical press; call once per frame per action.
  consume(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  consumeLook() {
    const dx = this.lookDX;
    const dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return { dx, dy };
  }

  endFrame() {
    // Keys pressed during the frame but never consumed would otherwise
    // linger; mouse clicks are the only ones we clear eagerly.
    this.pressed.delete('Mouse0');
  }
}
