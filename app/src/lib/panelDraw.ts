// Dispute Procedure Code 3.1 — "Eleven panelists are drawn from the eligible
// pool by verifiable public randomness. The selection method, seed, and result
// are published with the draw."
//
// How that is met here, in full, so anyone can check it:
//
//   1. The randomness comes from the drand public randomness beacon (the
//      "quicknet" chain), which publishes one unpredictable value every three
//      seconds. The draw does not choose which value: the round is the first one
//      published after the moment the pool was found eligible to draw from, and
//      that round number is recorded before the value is fetched.
//   2. seed = SHA-256 of a fixed text that joins the method name, the beacon
//      chain, round and randomness, the case being drawn for, the sorted list of
//      eligible Member ids (the pool), and the number of seats.
//   3. The panel is the first `size` entries of a Fisher-Yates shuffle of the
//      sorted pool, where every random number comes from hashing the seed with a
//      counter (see `selectPanel`). Same seed and pool, same panel, on any
//      machine.
//
// Everything in step 2 and the result is published with the draw, and
// `verifyDraw` re-runs steps 2 and 3 from those published values. What this
// does not do: it does not verify the beacon's own signature (the round can be
// checked by anyone against drand), and it cannot show that the pool itself was
// assembled honestly — the pool is published precisely so that can be checked.

export const PANEL_DRAW_METHOD = "sha256-fisher-yates/v1";

export const DRAND = {
  // drand "quicknet": unchained, 3-second rounds.
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesisSec: 1692803367,
  periodSec: 3,
  relays: ["https://api.drand.sh", "https://drand.cloudflare.com"],
} as const;

export interface Beacon {
  chainHash: string;
  round: number;
  randomness: string; // 64 hex characters
}

/** The first drand round published strictly after `tsMs`. */
export function drandRoundAfter(tsMs: number): number {
  const sinceGenesis = tsMs / 1000 - DRAND.genesisSec;
  if (sinceGenesis < 0) return 1;
  return Math.floor(sinceGenesis / DRAND.periodSec) + 2;
}

/** When a round is (first) published, in ms since the epoch. */
export function drandRoundPublishedAt(round: number): number {
  return (DRAND.genesisSec + (round - 1) * DRAND.periodSec) * 1000;
}

export type BeaconFetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Fetches one beacon round, trying each relay. Returns null when the round is
 * not available (not published yet, or every relay failed) — the caller retries
 * later. A response is accepted only if it names the round asked for and carries
 * 64 hex characters of randomness.
 */
export async function fetchDrandBeacon(round: number, fetchFn: BeaconFetch = fetch as unknown as BeaconFetch): Promise<Beacon | null> {
  for (const relay of DRAND.relays) {
    try {
      const res = await fetchFn(`${relay}/${DRAND.chainHash}/public/${round}`);
      if (!res.ok) continue;
      const body = (await res.json()) as { round?: unknown; randomness?: unknown };
      if (body.round === round && typeof body.randomness === "string" && /^[0-9a-f]{64}$/.test(body.randomness)) {
        return { chainHash: DRAND.chainHash, round, randomness: body.randomness };
      }
    } catch {
      // try the next relay
    }
  }
  return null;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DrawInputs {
  beacon: Beacon;
  caseKey: string; // e.g. "supporting-nominee-conduct:12:initial"
  poolIds: number[]; // eligible Member ids
  size: number;
}

export function canonicalPool(poolIds: number[]): number[] {
  return Array.from(new Set(poolIds)).sort((a, b) => a - b);
}

/** The text that is hashed into the seed — published as-is so it can be re-hashed by hand. */
export function seedText(i: DrawInputs): string {
  return [
    PANEL_DRAW_METHOD,
    `chain=${i.beacon.chainHash}`,
    `round=${i.beacon.round}`,
    `randomness=${i.beacon.randomness}`,
    `case=${i.caseKey}`,
    `pool=${canonicalPool(i.poolIds).join(",")}`,
    `size=${i.size}`,
  ].join("|");
}

export async function drawSeed(i: DrawInputs): Promise<string> {
  return sha256Hex(seedText(i));
}

// An unbiased integer in [0, range) from the seed: 32 bits per hash, rejecting
// the few values that would make small results slightly more likely.
async function uniformBelow(seed: string, label: string, range: number): Promise<number> {
  if (range <= 1) return 0;
  const limit = Math.floor(0x100000000 / range) * range;
  for (let counter = 0; ; counter++) {
    const h = await sha256Hex(`${seed}|${label}|${counter}`);
    const v = parseInt(h.slice(0, 8), 16);
    if (v < limit) return v % range;
  }
}

/** Fisher-Yates over the sorted pool, driven only by the seed; returns the first `size`. */
export async function selectPanel(poolIds: number[], seed: string, size: number): Promise<number[]> {
  const pool = canonicalPool(poolIds);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = await uniformBelow(seed, `shuffle-${i}`, i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

export interface PublishedDraw {
  method: string;
  beaconChain: string;
  beaconRound: number;
  beaconRandomness: string;
  caseKey: string;
  poolIds: number[];
  size: number;
  seed: string;
  drawnIds: number[];
}

/** Re-runs the published draw from its published inputs; true only if the seed and the result both reproduce. */
export async function verifyDraw(d: PublishedDraw): Promise<boolean> {
  if (d.method !== PANEL_DRAW_METHOD) return false;
  const inputs: DrawInputs = {
    beacon: { chainHash: d.beaconChain, round: d.beaconRound, randomness: d.beaconRandomness },
    caseKey: d.caseKey,
    poolIds: d.poolIds,
    size: d.size,
  };
  if ((await drawSeed(inputs)) !== d.seed) return false;
  const again = await selectPanel(d.poolIds, d.seed, d.size);
  return again.length === d.drawnIds.length && again.every((id, k) => id === d.drawnIds[k]);
}
