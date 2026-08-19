export type TilePos = { col: number; row: number };

function key(col: number, row: number): string {
  return `${col},${row}`;
}

function inBounds(col: number, row: number, walkable: boolean[][]): boolean {
  return row >= 0 && col >= 0 && row < walkable.length && col < walkable[0].length;
}

function canStep(walkable: boolean[][], col: number, row: number): boolean {
  return inBounds(col, row, walkable) && walkable[row][col];
}

function dist(a: TilePos, b: TilePos): number {
  const dc = a.col - b.col;
  const dr = a.row - b.row;
  return Math.hypot(dc, dr);
}

export function findPath(
  start: TilePos,
  goal: TilePos,
  walkable: boolean[][],
): TilePos[] | null {
  const origin = canStep(walkable, start.col, start.row)
    ? start
    : nearestWalkable(start, walkable);
  if (!origin) return null;

  const target = canStep(walkable, goal.col, goal.row) ? goal : nearestWalkable(goal, walkable);
  if (!target) return null;
  if (origin.col === target.col && origin.row === target.row) return [origin];

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const came = new Map<string, TilePos>();
  const cost = new Map<string, number>();
  const closed = new Set<string>();
  const open: Array<TilePos & { f: number }> = [{ ...origin, f: 0 }];
  cost.set(key(origin.col, origin.row), 0);

  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[best].f) best = i;
    }
    const current = open.splice(best, 1)[0];
    const currentKey = key(current.col, current.row);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.col === target.col && current.row === target.row) {
      return reconstruct(came, current);
    }

    for (const [dc, dr] of dirs) {
      const next = { col: current.col + dc, row: current.row + dr };
      if (!canStep(walkable, next.col, next.row)) continue;

      const nextKey = key(next.col, next.row);
      if (closed.has(nextKey)) continue;

      const nextCost = (cost.get(currentKey) ?? Infinity) + 1;
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue;

      came.set(nextKey, current);
      cost.set(nextKey, nextCost);
      const h = dist(next, target);
      open.push({ ...next, f: nextCost + h });
    }
  }

  return closestVisited(came, origin, goal, cost);
}

function closestVisited(
  came: Map<string, TilePos>,
  origin: TilePos,
  goal: TilePos,
  cost: Map<string, number>,
): TilePos[] | null {
  let best: TilePos | null = origin;
  let bestDist = dist(origin, goal);
  for (const token of cost.keys()) {
    const [col, row] = token.split(',').map(Number);
    const tile = { col, row };
    const d = dist(tile, goal);
    if (d < bestDist) {
      best = tile;
      bestDist = d;
    }
  }
  if (!best) return null;
  return reconstruct(came, best);
}

function nearestWalkable(from: TilePos, walkable: boolean[][]): TilePos | null {
  if (canStep(walkable, from.col, from.row)) return from;
  let best: TilePos | null = null;
  let bestDist = Infinity;
  for (let row = 0; row < walkable.length; row += 1) {
    for (let col = 0; col < walkable[row].length; col += 1) {
      if (!walkable[row][col]) continue;
      const d = dist({ col, row }, from);
      if (d < bestDist) {
        best = { col, row };
        bestDist = d;
      }
    }
  }
  return best;
}

function reconstruct(came: Map<string, TilePos>, current: TilePos): TilePos[] {
  const path = [current];
  const seen = new Set<string>([key(current.col, current.row)]);
  let node: TilePos | undefined = current;
  while (node) {
    const prev = came.get(key(node.col, node.row));
    if (!prev) break;
    const prevKey = key(prev.col, prev.row);
    if (seen.has(prevKey)) break;
    seen.add(prevKey);
    path.unshift(prev);
    node = prev;
  }
  return path;
}
