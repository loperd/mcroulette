import { Box3, Plane, Vector3 } from 'three';

/**
 * Procedural fracture by recursive random plane cuts (a seeded BSP): every cell is a convex
 * polyhedron, the intersection of the part's bounding box with the half-spaces of its cuts. The
 * same seed gives the same fragments; another seed gives a different break.
 *
 * Planes follow three.js clipping semantics: a point is kept where every plane's signed distance is
 * >= 0, so a cell's planes can be used directly as material.clippingPlanes.
 */
export interface FractureCell {
  readonly planes: readonly Plane[];
  /** Sample points inside the cell (mesh space): centre, contact points, size. */
  readonly points: readonly Vector3[];
  readonly centre: Vector3;
}

/**
 * Inward-facing planes of a box, pushed out by `margin`. The mesh's own faces lie exactly on the
 * box; a plane through them would discard pixels at random (distance ≈ 0), speckling the surface.
 */
export function boxPlanes(box: Box3, margin = 0): Plane[] {
  return [0, 1, 2].flatMap(axis => [
    new Plane(new Vector3().setComponent(axis, 1), -box.min.getComponent(axis) + margin),
    new Plane(new Vector3().setComponent(axis, -1), box.max.getComponent(axis) + margin)]);
}

/**
 * Cuts `box` into up to `count` convex cells. `flatness` 0..1 tilts cut normals towards vertical
 * planes (0 = any direction, 1 = only vertical cuts: slabs that topple).
 */
export function fractureCells(box: Box3, count: number, next: () => number, flatness = 0): FractureCell[] {
  const size = box.getSize(new Vector3());
  const samples = Array.from({ length: 360 }, () =>
    new Vector3(box.min.x + size.x * next(), box.min.y + size.y * next(), box.min.z + size.z * next()));
  let cells: { planes: Plane[]; points: Vector3[] }[] = [{ planes: boxPlanes(box, Math.max(size.x, size.y, size.z) * .02), points: samples }];
  for (let guard = 0; cells.length < count && guard < count * 8; guard++) {
    // Always split the largest remaining fragment, so sizes stay comparable.
    cells.sort((a, b) => b.points.length - a.points.length);
    const cell = cells[0]!;
    if (cell.points.length < 12) break;
    const through = cell.points[Math.floor(next() * cell.points.length)]!;
    const normal = new Vector3(next() * 2 - 1, (next() * 2 - 1) * (1 - flatness), next() * 2 - 1);
    if (normal.lengthSq() < 1e-6) continue;
    normal.normalize();
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, through);
    const front = cell.points.filter(point => plane.distanceToPoint(point) >= 0);
    const back = cell.points.filter(point => plane.distanceToPoint(point) < 0);
    // Reject slivers: both sides need a real share of the volume.
    if (front.length < cell.points.length * .2 || back.length < cell.points.length * .2) continue;
    cells = [...cells.slice(1), { planes: [...cell.planes, plane], points: front },
      { planes: [...cell.planes, plane.clone().negate()], points: back }];
  }
  return cells.map(cell => ({ planes: cell.planes, points: cell.points,
    centre: cell.points.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(cell.points.length) }));
}
