// Pot meter: how close a token's next payout round is. A round needs two things, read from the API:
// a pot big enough to carry its gas (potNeed) and the keeper's next pass (nextRoundAt).
// The mercury climbs with the pot up to the "ready" mark, then with the keeper's clock to the top.

export const READY_AT = 0.6;

export type PotPhase = "empty" | "filling" | "ready" | "jackpot" | "paying";

export function potLevel(pot: number, need: number, nextAt: number | null, interval: number, now: number): { level: number; phase: PotPhase; left: number } {
  if (!(pot > 0)) return { level: 0, phase: "empty", left: 0 };
  if (pot < need) return { level: READY_AT * (pot / need), phase: "filling", left: 0 };
  const left = nextAt ? nextAt - now : 0;
  // no clock, or one that stopped a whole interval ago: ready, waiting on the keeper's next pass
  if (!nextAt || left < -interval) return { level: READY_AT, phase: "ready", left: 0 };
  if (left <= 0) return { level: 1, phase: "paying", left: 0 };
  const clock = 1 - Math.min(1, left / interval);
  return { level: READY_AT + (1 - READY_AT) * clock, phase: left <= Math.max(60, interval * 0.1) ? "jackpot" : "ready", left };
}

/** 12:05 under an hour, 3h 20m above. */
export function countdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
