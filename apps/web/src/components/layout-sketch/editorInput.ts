import { type KeyboardEvent } from "react";

export function confirmOrCancelStringEdit(
  event: KeyboardEvent<HTMLInputElement>,
  original: string,
) {
  if (event.key === "Enter") event.currentTarget.blur();
  if (event.key === "Escape") {
    event.currentTarget.value = original;
    event.currentTarget.blur();
  }
}
