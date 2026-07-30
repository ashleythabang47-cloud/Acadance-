import type { KeyboardEvent } from "react";

/**
 * For elements using role="button" on a non-native element (a div or
 * span), the browser doesn't automatically make Enter/Space trigger a
 * click the way it would for a real <button>. This wires that up.
 * Usage: <div role="button" tabIndex={0} onKeyDown={handleKeyActivation(onClick)} />
 */
export function handleKeyActivation(callback: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      callback();
    }
  };
}
