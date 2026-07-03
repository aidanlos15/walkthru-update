import type { Shot } from "./types";

/**
 * Deterministic grouping / ordering net applied to the director's shots before
 * the review gate.
 *
 * The director is asked to keep shots of the same space (and the open-plan areas
 * that flow into it) adjacent, ordered as a natural walk-through. It usually
 * does, but it sometimes leaves a stray photo where it was uploaded, e.g. a
 * "sitting room open to the dining area" photo uploaded last ends up last, away
 * from the other sitting-room shots it belongs with.
 *
 * This pass fixes that regardless of what order the model returns: it clusters
 * shots that show the same room (same name) or are open-plan connected to each
 * other, then emits every cluster as one contiguous block positioned at its
 * FIRST photo's original spot. Order within a cluster and the relative order of
 * clusters (by first appearance) are preserved, so the tour still flows in the
 * sequence the director intended, just with related rooms compiled together.
 */

const norm = (s: string) => s.trim().toLowerCase();

/** Does either shot name the other's room in its open-plan list? */
function openPlanLinked(a: Shot, b: Shot): boolean {
  const ra = norm(a.room);
  const rb = norm(b.room);
  return (
    (a.openPlanWith ?? []).some((r) => norm(r) === rb) ||
    (b.openPlanWith ?? []).some((r) => norm(r) === ra)
  );
}

export function groupShotsByRoom(shots: Shot[]): Shot[] {
  const n = shots.length;
  if (n < 2) return shots;

  // Union-find over shot indexes. Two shots merge when they show the same room
  // or are open-plan connected; connectivity is transitive, so a chain
  // (living → dining → kitchen) collapses into one open-plan block.
  const parent = shots.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (norm(shots[i].room) === norm(shots[j].room) || openPlanLinked(shots[i], shots[j])) {
        union(i, j);
      }
    }
  }

  // Bucket by cluster root, preserving each shot's original order within its
  // cluster. Clusters are keyed by the smallest original index they contain
  // (that index is the union-find root), so ordering clusters by their root
  // orders them by first appearance.
  const clusters = new Map<number, Shot[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const bucket = clusters.get(root);
    if (bucket) bucket.push(shots[i]);
    else clusters.set(root, [shots[i]]);
  }

  return [...clusters.keys()]
    .sort((a, b) => a - b)
    .flatMap((root) => clusters.get(root)!);
}
