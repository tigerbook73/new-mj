import { useState, type FormEvent, type KeyboardEvent } from "react";

const TRIGGER_PATTERN = /\$([A-Za-z0-9_]*)$/;

interface AutocompleteState {
  open: boolean;
  start: number;
  candidates: string[];
  selectedIndex: number;
}

const CLOSED: AutocompleteState = { open: false, start: -1, candidates: [], selectedIndex: 0 };

/**
 * `$name` autocomplete for any raw-expression text input (property fields,
 * grid template, a variable's own value) — detects an in-progress `$partial`
 * ending at the caret, offers prefix-matching variable names, and splices
 * the chosen name back in on select. Deliberately reads/writes the input's
 * DOM value directly (`event.currentTarget.value`, not React state) so it
 * layers on top of each call site's existing uncontrolled
 * defaultValue+onBlur-commit input without changing that model.
 */
export function useVariableAutocomplete(variableNames: readonly string[]) {
  const [state, setState] = useState<AutocompleteState>(CLOSED);

  const onInput = (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    const match = TRIGGER_PATTERN.exec(input.value.slice(0, caret));
    if (!match) {
      setState(CLOSED);
      return;
    }
    const partial = match[1]!.toLowerCase();
    const candidates = variableNames.filter((name) => name.toLowerCase().startsWith(partial));
    if (candidates.length === 0) {
      setState(CLOSED);
      return;
    }
    setState({ open: true, start: match.index, candidates, selectedIndex: 0 });
  };

  const select = (input: HTMLInputElement, index: number) => {
    const name = state.candidates[index];
    if (!name) return;
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, state.start);
    const after = input.value.slice(caret);
    input.value = `${before}$${name}${after}`;
    const nextCaret = state.start + 1 + name.length;
    input.setSelectionRange(nextCaret, nextCaret);
    setState(CLOSED);
  };

  /** Returns true if the key was consumed (caller should not also treat it as its own Enter/Escape). */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    if (!state.open) return false;
    if (event.key === "ArrowDown") {
      setState((current) => ({
        ...current,
        selectedIndex: (current.selectedIndex + 1) % current.candidates.length,
      }));
      return true;
    }
    if (event.key === "ArrowUp") {
      setState((current) => ({
        ...current,
        selectedIndex:
          (current.selectedIndex - 1 + current.candidates.length) % current.candidates.length,
      }));
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      select(event.currentTarget, state.selectedIndex);
      return true;
    }
    if (event.key === "Escape") {
      setState(CLOSED);
      return true;
    }
    return false;
  };

  return {
    open: state.open,
    candidates: state.candidates,
    selectedIndex: state.selectedIndex,
    onInput,
    onKeyDown,
    select,
    close: () => setState(CLOSED),
  };
}
