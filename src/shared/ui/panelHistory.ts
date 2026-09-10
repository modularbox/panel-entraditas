// The browser history is useless for "Volver" inside the panel: it contains the
// /login entry from when the user entered (and possibly external pages), so a raw
// navigate(-1) can drop the user back into a login form. Instead we keep our own
// stack of visited panel routes (recorded from PanelLayout, hence never auth pages)
// and BackButton navigates to the previous entry of that stack.
let stack: string[] = [];

/** Record a panel visit, truncating the stack when going back to an earlier view. */
export function recordPanelVisit(path: string) {
  if (path === stack[stack.length - 1]) return;
  const existing = stack.indexOf(path);
  if (existing !== -1) {
    stack = stack.slice(0, existing + 1);
  } else {
    stack.push(path);
  }
}

/** The panel route visited right before the current one, or null when there is none. */
export function getPreviousPanelVisit(): string | null {
  return stack.length >= 2 ? stack[stack.length - 2] ?? null : null;
}

export function resetPanelHistory() {
  stack = [];
}