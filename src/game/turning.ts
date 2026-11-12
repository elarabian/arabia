const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
export const angleDelta = (target: number, current: number) => Math.atan2(Math.sin(target-current), Math.cos(target-current));

/** Damped angular motion, in radians and seconds; no instant mirroring. */
export class TurningMotion {
  public angle = Math.PI / 2;
  public velocity = 0;
  public stepPhase = 0;

  public step(dt: number, target: number) {
    // Small integration steps keep acceleration consistent across display refresh rates.
    let remaining = Math.max(0, Math.min(dt, .1));
    while (remaining > 0) {
      const h = Math.min(remaining, 1/120);
      const error = angleDelta(target, this.angle);
      const acceleration = clamp(50 * error - 14 * this.velocity, 18);
      this.velocity = clamp(this.velocity + acceleration * h, 3.2);
      this.angle += this.velocity * h;
      this.stepPhase += Math.abs(this.velocity) * h * 6;
      remaining -= h;
    }
    return Math.abs(angleDelta(target, this.angle)) < .09 && Math.abs(this.velocity) < .32;
  }
}
