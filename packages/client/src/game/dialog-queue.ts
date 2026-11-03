import { TEXT_FRAMES_PER_CHAR, type TextSpeed } from "@soulsilver/shared";

// The text box (spec 017, US4, research R8): pages typed out at the original's speed, confirm to
// finish a page and then to advance, and a choice after the last page: yes/no after a question, or
// a script's list (spec 023). The script interpreter (spec 19) drives the same queue.

const FRAME_MS = 1000 / 60;

interface Entry {
  pages: string[];
  /** The choice after the last page; none for plain text. */
  options: string[] | undefined;
  resolve: (answer: number) => void;
}

export interface DialogView {
  text: string;
  complete: boolean;
  /** The choice is up (after the last page). */
  choosing: boolean;
  options: string[];
  cursor: number;
  /** Yes/No only: the cursor is on Yes. */
  yes: boolean;
}

/** Yes/No as a list; the box shows its own labels for it. */
const YES_NO = ["yes", "no"];

export function createDialogQueue() {
  const queue: Entry[] = [];
  let page = 0;
  /** Characters typed so far, fractional between frames. */
  let typed = 0;
  let cursor = 0;

  const head = () => queue[0];
  const text = () => head()?.pages[page] ?? "";
  const complete = () => typed >= text().length;
  const lastPage = () => page === (head()?.pages.length ?? 1) - 1;

  function next(answer: number): void {
    const done = queue.shift();
    page = 0;
    typed = 0;
    cursor = 0;
    done?.resolve(answer);
  }

  function push(pages: string[], options: string[] | undefined): Promise<number> {
    return new Promise((resolve) => queue.push({ pages: pages.length > 0 ? pages : [""], options, resolve }));
  }

  return {
    say: (pages: string[]): Promise<void> => push(pages, undefined).then(() => undefined),
    /** Resolves to true for Yes; cancel answers No. */
    ask: (pages: string[]): Promise<boolean> => push(pages, YES_NO).then((i) => i === 0),
    /** Resolves to the index picked; cancel answers -1. */
    choose: (pages: string[], options: string[]): Promise<number> => push(pages, options),
    /** Drops everything queued; what waited on it never resolves, as the script it belonged to is gone. */
    clear(): void {
      queue.length = 0;
      page = 0;
      typed = 0;
      cursor = 0;
    },
    /** Types for `elapsedMs` at `speed`, `boost` times faster (cutscene text, spec 021). */
    step(elapsedMs: number, speed: TextSpeed, boost = 1): void {
      if (head()) typed = Math.min(text().length, typed + (elapsedMs * boost) / FRAME_MS / TEXT_FRAMES_PER_CHAR[speed]);
    },
    confirm(): void {
      const h = head();
      if (!h) return;
      if (!complete()) typed = text().length;
      else if (!lastPage()) {
        page++;
        typed = 0;
      } else next(h.options ? cursor : 0);
    },
    cancel(): void {
      const h = head();
      if (h?.options && complete() && lastPage()) next(h.options === YES_NO ? 1 : -1);
      else this.confirm();
    },
    /** Moves the choice cursor, wrapping around. */
    move(step = 1): void {
      const n = head()?.options?.length ?? 1;
      cursor = (cursor + step + n) % n;
    },
    view(): DialogView | undefined {
      const h = head();
      if (!h) return undefined;
      const choosing = h.options !== undefined && complete() && lastPage();
      return { text: text().slice(0, Math.floor(typed)), complete: complete(), choosing, options: h.options === YES_NO ? [] : (h.options ?? []), cursor, yes: cursor === 0 };
    },
  };
}

export type DialogQueue = ReturnType<typeof createDialogQueue>;
