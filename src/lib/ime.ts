// isImeEnter(e): true for a keydown that belongs to an IME composition, so Enter handlers (and the
// document-level shortcuts) must ignore it. Chrome/Firefox mark the composition-confirming Enter
// with isComposing; WebKit (Safari) fires it with isComposing = false but keyCode 229. Accepts a
// React synthetic event (isComposing lives on nativeEvent) or a native KeyboardEvent.

interface KeyEventLike {
  keyCode?: number;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
}

export function isImeEnter(e: KeyEventLike): boolean {
  return Boolean(e.nativeEvent?.isComposing || e.isComposing || e.keyCode === 229);
}
