import { TEXT_FRAMES_PER_CHAR, type TextSpeed } from "@soulsilver/shared";

// The text box (spec 017, US4, research R8): pages typed out at the original's speed, confirm to
// finish a page and then to advance, and a yes/no choice after a question. The script interpreter
// (spec 19) drives the same queue.

const FRAME_MS = 1000 / 60;

interface Entry {
  pages: string[];
  ask: boolean;
  resolve: (answer: boolean) => void;
}

export interface DialogView {
  text: string;
  complete: boolean;
  /** The yes/no choice is up (questions only, after the last page). */
  choosing: boolean;
  /** Where the cursor is: Yes or No. */
  yes: boolean;
}

export function createDialogQueue() {
  const queue: Entry[] = [];
  let page = 0;
  /** Characters typed so far, fractional between frames. */
  let typed = 0;
  let yes = true;

  const head = () => queue[0];
  const text = () => head()?.pages[page] ?? "";
  const complete = () => typed >= text().length;
  const lastPage = () => page === (head()?.pages.length ?? 1) - 1;

  function next(answer: boolean): void {
    const done = queue.shift();
    page = 0;
    typed = 0;
    yes = true;
    done?.resolve(answer);
  }

  function push(pages: string[], ask: boolean): Promise<boolean> {
    return new Promise((resolve) => queue.push({ pages: pages.length > 0 ? pages : [""], ask, resolve }));
  }

  return {
    say: (pages: string[]): Promise<void> => push(pages, false).then(() => undefined),
    /** Resolves to true for Yes; cancel answers No. */
    ask: (pages: string[]): Promise<boolean> => push(pages, true),
    /** Types for `elapsedMs` at `speed`. */
    step(elapsedMs: number, speed: TextSpeed): void {
      if (head()) typed = Math.min(text().length, typed + elapsedMs / FRAME_MS / TEXT_FRAMES_PER_CHAR[speed]);
    },
    confirm(): void {
      const h = head();
      if (!h) return;
      if (!complete()) typed = text().length;
      else if (!lastPage()) {
        page++;
        typed = 0;
      } else next(h.ask ? yes : true);
    },
    cancel(): void {
      const h = head();
      if (h?.ask && complete() && lastPage()) next(false);
      else this.confirm();
    },
    /** Moves the yes/no cursor. */
    move(): void {
      yes = !yes;
    },
    view(): DialogView | undefined {
      const h = head();
      if (!h) return undefined;
      return { text: text().slice(0, Math.floor(typed)), complete: complete(), choosing: h.ask && complete() && lastPage(), yes };
    },
  };
}

export type DialogQueue = ReturnType<typeof createDialogQueue>;
