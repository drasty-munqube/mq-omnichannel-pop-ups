/* ============================================================
   BUILDER STATE + UNDO/REDO

   The whole draft (name, status, document) is one immutable
   value. Every edit pushes the previous value onto `past`, so
   undo is just stepping back. Typing in one field is coalesced
   into a single step, otherwise each keystroke would be its own
   undo and Cmd+Z would feel broken.

   Nothing here touches the network; the draft only leaves the
   browser when the merchant presses Save.
   ============================================================ */

import type { EmailTemplateDoc } from "./schema";

export type Draft = {
  name: string;
  status: "draft" | "active";
  doc: EmailTemplateDoc;
};

export type HistoryState = {
  past: Draft[];
  present: Draft;
  future: Draft[];
  lastKey: string | null;
  lastAt: number;
};

export type HistoryAction =
  | {
      type: "edit";
      update: (draft: Draft) => Draft;
      /* edits with the same key inside COALESCE_MS merge into one step */
      coalesceKey?: string;
      now?: number;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "replace"; draft: Draft }
  | { type: "reset"; draft: Draft };

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 1000;

export function initHistory(draft: Draft): HistoryState {
  return { past: [], present: draft, future: [], lastKey: null, lastAt: 0 };
}

export function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  switch (action.type) {
    case "edit": {
      const next = action.update(state.present);
      if (next === state.present) return state;

      const now = action.now ?? Date.now();
      const coalesce =
        !!action.coalesceKey &&
        action.coalesceKey === state.lastKey &&
        now - state.lastAt < COALESCE_MS;

      return {
        past: coalesce
          ? state.past
          : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        lastKey: action.coalesceKey ?? null,
        lastAt: now,
      };
    }

    case "undo": {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastKey: null,
        lastAt: 0,
      };
    }

    case "redo": {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
        lastKey: null,
        lastAt: 0,
      };
    }

    /* Swap in the server's copy after a save, keeping history. */
    case "replace":
      return { ...state, present: action.draft, lastKey: null, lastAt: 0 };

    case "reset":
      return initHistory(action.draft);
  }
}

/* Stable fingerprint for "has anything changed since saving". */
export function draftSignature(draft: Draft) {
  return JSON.stringify([draft.name, draft.status, draft.doc]);
}
