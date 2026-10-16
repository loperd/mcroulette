/** Geometry copied from master:src/view/component/Circle.vue (Konva Circle + Arc). */
export function legacyCircleRadius(width: number, height: number): number {
  const size = Math.max(width, height);
  if (size < 640) return size / 3;
  if (size < 768) return size / 4;
  if (size < 1024) return size / 5;
  if (size < 1280) return size / 7;
  return size / 10;
}

export function drawLegacyCircle(context: CanvasRenderingContext2D, width: number, height: number): void {
  const radius = legacyCircleRadius(width, height), x = width / 2, y = height / 2;
  context.save();
  context.globalAlpha = 0.17; context.fillStyle = 'black';
  // The original circle had radius R and strokeWidth R: the empty center has radius R/2.
  context.beginPath();
  context.arc(x, y, radius * 1.5, 0, Math.PI * 2);
  context.arc(x, y, radius * 0.5, 0, Math.PI * 2, true);
  context.fill('evenodd');
  // Original Arc: angle 180°, innerRadius 0, outerRadius R/2 - 5% R.
  context.beginPath(); context.moveTo(x, y);
  context.arc(x, y, radius * 0.45, 0, Math.PI);
  context.closePath(); context.fill();
  context.restore();
}
