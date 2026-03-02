import { useCallback, useRef, useEffect } from "react";

/**
 * Scrolls an input element into view when it receives focus,
 * compensating for mobile virtual keyboards that obscure content.
 *
 * Usage:
 *   const scrollRef = useScrollToInput<HTMLInputElement>();
 *   <Input ref={scrollRef} ... />
 *
 * Or attach manually:
 *   const { handleFocus } = useScrollToInputHandler();
 *   <Input onFocus={handleFocus} ... />
 */

const KEYBOARD_DELAY = 350; // ms to wait for virtual keyboard to appear

function scrollElementIntoView(el: HTMLElement) {
  // Small delay so the virtual keyboard has time to resize the viewport
  setTimeout(() => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, KEYBOARD_DELAY);
}

/**
 * Returns a ref that auto-scrolls the element into view on focus.
 */
export function useScrollToInput<T extends HTMLElement = HTMLInputElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = () => scrollElementIntoView(el);
    el.addEventListener("focus", handler);
    return () => el.removeEventListener("focus", handler);
  }, []);

  return ref;
}

/**
 * Returns a focus handler you can attach to any input via onFocus.
 */
export function useScrollToInputHandler() {
  const handleFocus = useCallback((e: React.FocusEvent<HTMLElement>) => {
    scrollElementIntoView(e.currentTarget);
  }, []);

  return { handleFocus };
}

/**
 * Hook that creates a callback ref — useful when you have dynamic lists of inputs
 * (e.g. participant rows) where a stable ref won't work.
 * Attaches a focus listener that scrolls the element into view.
 */
export function useScrollToInputCallback() {
  const cleanupMap = useRef(new Map<HTMLElement, () => void>());

  const callbackRef = useCallback((el: HTMLElement | null) => {
    if (el && !cleanupMap.current.has(el)) {
      const handler = () => scrollElementIntoView(el);
      el.addEventListener("focus", handler);
      cleanupMap.current.set(el, () => el.removeEventListener("focus", handler));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupMap.current.forEach((cleanup) => cleanup());
      cleanupMap.current.clear();
    };
  }, []);

  return callbackRef;
}
