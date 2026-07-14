import type { EventVisibility, GameEvent } from "./types.ts";

export const nextEventSeq = (currentSeq: number): number => {
  if (!Number.isInteger(currentSeq) || currentSeq < 0) {
    throw new Error("INVALID_EVENT_SEQUENCE");
  }
  return currentSeq + 1;
};

// seq 是状态中已发出的最大序号；非法动作不会调用本函数，也不会消耗序号。
export const createEvent = <TPayload>(
  seq: number,
  visibility: EventVisibility,
  payload: TPayload,
): GameEvent<TPayload> => ({ seq, visibility, payload });
