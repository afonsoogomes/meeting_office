const DEAD = 0.22;
const SPRINT = 0.88;

export class WalkJoystick {
  private readonly root = document.querySelector('#joystick') as HTMLElement | null;
  private readonly knob = document.querySelector('#joystick-knob') as HTMLElement | null;
  private readonly onEngage: () => void;
  private pointerId: number | null = null;
  private x = 0;
  private y = 0;
  private blocked = false;
  private readonly onDown = (event: PointerEvent) => this.handleDown(event);
  private readonly onMove = (event: PointerEvent) => this.handleMove(event);
  private readonly onUp = (event: PointerEvent) => this.handleUp(event);

  private readonly query = window.matchMedia('(any-pointer: coarse)');
  private readonly onQuery = (): void => this.syncVisibility();

  constructor(onEngage: () => void) {
    this.onEngage = onEngage;
    if (!this.root) return;
    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    this.root.addEventListener('pointerup', this.onUp);
    this.root.addEventListener('pointercancel', this.onUp);
    this.query.addEventListener('change', this.onQuery);
    this.syncVisibility();
  }

  setBlocked(blocked: boolean): void {
    if (this.blocked === blocked) return;
    this.blocked = blocked;
    this.root?.classList.toggle('is-blocked', blocked);
    if (blocked) this.reset();
  }

  vector(): { x: number; y: number } | null {
    if (this.blocked || this.pointerId === null) return null;
    const mag = Math.hypot(this.x, this.y);
    if (mag < DEAD) return null;
    const strength = Math.min(1, (mag - DEAD) / (1 - DEAD));
    return { x: (this.x / mag) * strength, y: (this.y / mag) * strength };
  }

  sprinting(): boolean {
    if (this.blocked || this.pointerId === null) return false;
    return Math.hypot(this.x, this.y) >= SPRINT;
  }

  destroy(): void {
    this.query.removeEventListener('change', this.onQuery);
    this.reset();
    this.root?.removeEventListener('pointerdown', this.onDown);
    this.root?.removeEventListener('pointermove', this.onMove);
    this.root?.removeEventListener('pointerup', this.onUp);
    this.root?.removeEventListener('pointercancel', this.onUp);
  }

  private syncVisibility(): void {
    if (!this.root) return;
    const touch = (navigator.maxTouchPoints ?? 0) > 0 || this.query.matches;
    this.root.classList.toggle('hidden', !touch);
  }

  private handleDown(event: PointerEvent): void {
    if (this.blocked || this.pointerId !== null) return;
    if (!this.root) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.root.setPointerCapture(event.pointerId);
    this.root.classList.add('is-active');
    this.onEngage();
    this.apply(event);
  }

  private handleMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.apply(event);
  }

  private handleUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.reset();
  }

  private apply(event: PointerEvent): void {
    if (!this.root) return;
    const rect = this.root.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = event.clientX - (rect.left + radius);
    const dy = event.clientY - (rect.top + radius);
    const mag = Math.hypot(dx, dy);
    const scale = mag > radius && mag > 0 ? radius / mag : 1;
    this.x = (dx * scale) / radius;
    this.y = (dy * scale) / radius;
    if (this.knob) this.knob.style.transform = `translate(${this.x * radius}px, ${this.y * radius}px)`;
  }

  private reset(): void {
    if (this.pointerId !== null && this.root) {
      try {
        this.root.releasePointerCapture(this.pointerId);
      } catch {
        /* already released */
      }
    }
    this.pointerId = null;
    this.x = 0;
    this.y = 0;
    this.root?.classList.remove('is-active');
    if (this.knob) this.knob.style.transform = '';
  }
}
