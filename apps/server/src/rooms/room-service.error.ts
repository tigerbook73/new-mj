import type { ErrCode } from "@new-mj/protocol";

/** Thrown by RoomService; the gateway (step 5) catches this and maps `code` to an ack error. */
export class RoomServiceError extends Error {
  constructor(
    public readonly code: ErrCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "RoomServiceError";
  }
}
