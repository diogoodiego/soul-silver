// The part of Hairline's engine the app calls itself; figures reach the rest through the global HL.

export declare const HL: {
  inject(root: Document): void;
  mk(tag: string, attrs: Record<string, string>, parent: Element): SVGElement;
};
