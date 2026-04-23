/**
 * Mouse Humanization Module
 * 
 * Generates human-like mouse movements using Bézier curves
 * with overshoot, jitter, and idle drift.
 */

class HumanMouse {
  constructor(page, config = {}) {
    this.page = page;
    this.config = {
      overshootProbability: config.overshootProbability || 0.2,
      idleDriftInterval: config.idleDriftInterval || 8000,
      jitterAmplitude: config.jitterAmplitude || 2,
      baseSpeed: config.baseSpeed || 1.0, // multiplier
      ...config,
    };
    this.currentX = 0;
    this.currentY = 0;
    this.driftTimer = null;
  }

  /**
   * Generate a cubic Bézier curve path between two points
   */
  _bezierPath(startX, startY, endX, endY, steps = 30) {
    // Control points with natural curvature
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Randomize control points for natural-looking curves
    const cp1x = startX + dx * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * distance * 0.3;
    const cp1y = startY + dy * (0.1 + Math.random() * 0.2) + (Math.random() - 0.5) * distance * 0.3;
    const cp2x = startX + dx * (0.5 + Math.random() * 0.3) + (Math.random() - 0.5) * distance * 0.2;
    const cp2y = startY + dy * (0.6 + Math.random() * 0.3) + (Math.random() - 0.5) * distance * 0.2;

    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Easing: slow start, fast middle, slow end
      const easedT = this._easeInOutCubic(t);

      const x = Math.pow(1 - easedT, 3) * startX
              + 3 * Math.pow(1 - easedT, 2) * easedT * cp1x
              + 3 * (1 - easedT) * Math.pow(easedT, 2) * cp2x
              + Math.pow(easedT, 3) * endX;

      const y = Math.pow(1 - easedT, 3) * startY
              + 3 * Math.pow(1 - easedT, 2) * easedT * cp1y
              + 3 * (1 - easedT) * Math.pow(easedT, 2) * cp2y
              + Math.pow(easedT, 3) * endY;

      // Add jitter
      const jx = x + (Math.random() - 0.5) * this.config.jitterAmplitude;
      const jy = y + (Math.random() - 0.5) * this.config.jitterAmplitude;

      points.push({ x: Math.round(jx), y: Math.round(jy) });
    }
    return points;
  }

  _easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  _randomDelay(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Move mouse to coordinates with human-like behavior
   */
  async moveTo(targetX, targetY, options = {}) {
    const { overshoot = true } = options;
    const shouldOvershoot = overshoot && Math.random() < this.config.overshootProbability;

    if (shouldOvershoot) {
      // Overshoot target by 5-20px in a random direction
      const angle = Math.random() * Math.PI * 2;
      const overshootDist = 5 + Math.random() * 15;
      const overshootX = targetX + Math.cos(angle) * overshootDist;
      const overshootY = targetY + Math.sin(angle) * overshootDist;

      // Move to overshoot point
      await this._executeMove(this.currentX, this.currentY, overshootX, overshootY);

      // Pause (noticing the overshoot)
      await this._sleep(this._randomDelay(50, 150));

      // Correct to actual target with fewer steps
      await this._executeMove(overshootX, overshootY, targetX, targetY, 8);
    } else {
      await this._executeMove(this.currentX, this.currentY, targetX, targetY);
    }

    this.currentX = targetX;
    this.currentY = targetY;
  }

  async _executeMove(fromX, fromY, toX, toY, steps) {
    const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
    const numSteps = steps || Math.max(15, Math.min(50, Math.floor(distance / 10)));
    const path = this._bezierPath(fromX, fromY, toX, toY, numSteps);

    for (let i = 0; i < path.length; i++) {
      await this.page.mouse.move(path[i].x, path[i].y);
      // Variable delay between movements — faster in middle, slower at edges
      const progress = i / path.length;
      const speedFactor = 1 - Math.abs(progress - 0.5) * 0.8;
      const delay = (2 + Math.random() * 4) / (speedFactor * this.config.baseSpeed);
      await this._sleep(delay);
    }
  }

  /**
   * Click on an element with human-like approach
   */
  async click(selector, options = {}) {
    const element = await this.page.waitForSelector(selector, { timeout: 10000 });
    const box = await element.boundingBox();
    if (!box) throw new Error(`Element not visible: ${selector}`);

    // Click slightly off-center (humans don't click dead center)
    const offsetX = (Math.random() - 0.5) * box.width * 0.4;
    const offsetY = (Math.random() - 0.5) * box.height * 0.3;
    const clickX = box.x + box.width / 2 + offsetX;
    const clickY = box.y + box.height / 2 + offsetY;

    await this.moveTo(clickX, clickY);

    // Small pause before clicking (human hesitation)
    await this._sleep(this._randomDelay(30, 120));

    await this.page.mouse.down();
    await this._sleep(this._randomDelay(40, 100)); // Hold duration
    await this.page.mouse.up();

    // Small pause after clicking
    await this._sleep(this._randomDelay(100, 300));
  }

  /**
   * Idle drift — mouse wanders while "reading"
   */
  async idleDrift(durationMs) {
    const viewport = await this.page.viewportSize();
    const endTime = Date.now() + durationMs;

    while (Date.now() < endTime) {
      // Move to a random position on the visible page
      const driftX = Math.random() * (viewport.width * 0.8) + viewport.width * 0.1;
      const driftY = Math.random() * (viewport.height * 0.8) + viewport.height * 0.1;

      await this.moveTo(driftX, driftY, { overshoot: false });

      // Wait before next drift
      const waitTime = Math.min(
        this._randomDelay(2000, this.config.idleDriftInterval),
        endTime - Date.now()
      );
      if (waitTime > 0) await this._sleep(waitTime);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HumanMouse;
