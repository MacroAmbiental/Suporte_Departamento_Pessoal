import "./modalScroll.css";

const selector = ".modal-backdrop, .modal-overlay, .process-drawer-backdrop, .models-modal-backdrop, .experience-clt-confirmation-backdrop";

/** One document-wide owner prevents nested dialogs from unlocking each other. */
export function installModalScrollLock(doc: Document = document) {
  const win = doc.defaultView;
  if (!win || !doc.body) return () => {};
  let active: HTMLElement | null = null;
  let restore: (() => void) | null = null;
  let touchX = 0;
  let touchY = 0;

  function visible(element: HTMLElement) {
    const style = win!.getComputedStyle(element);
    return !element.closest('[hidden], [aria-hidden="true"]') && style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }
  function layer(element: HTMLElement) {
    let z = 0;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      z = Math.max(z, Number.parseInt(win!.getComputedStyle(node).zIndex, 10) || 0);
    }
    return z;
  }
  function sync() {
    const overlays = Array.from(doc.querySelectorAll<HTMLElement>(selector)).filter(visible);
    let top: HTMLElement | null = null;
    for (const overlay of overlays) {
      if (!top || top.contains(overlay) || (!overlay.contains(top) && layer(overlay) >= layer(top))) top = overlay;
    }
    active = top;
    if (active && !restore) {
      const x = win!.scrollX, y = win!.scrollY;
      const body = doc.body, root = doc.documentElement;
      const properties = ["position", "top", "left", "width", "overflow", "padding-right", "box-sizing"];
      const saved = properties.map((key) => [key, body.style.getPropertyValue(key), body.style.getPropertyPriority(key)]);
      const rootOverflow = [root.style.getPropertyValue("overflow"), root.style.getPropertyPriority("overflow")];
      const gap = Math.max(0, win!.innerWidth - root.clientWidth);
      const padding = Number.parseFloat(win!.getComputedStyle(body).paddingRight) || 0;
      root.style.setProperty("overflow", "hidden", "important");
      body.style.setProperty("position", "fixed", "important");
      body.style.setProperty("top", `${-y}px`, "important");
      body.style.setProperty("left", `${-x}px`, "important");
      body.style.setProperty("width", "100%", "important");
      body.style.setProperty("box-sizing", "border-box", "important");
      body.style.setProperty("overflow", "hidden", "important");
      if (gap) body.style.setProperty("padding-right", `${padding + gap}px`, "important");
      restore = () => {
        for (const [key, value, priority] of saved) {
          if (value) body.style.setProperty(key, value, priority); else body.style.removeProperty(key);
        }
        if (rootOverflow[0]) root.style.setProperty("overflow", rootOverflow[0], rootOverflow[1]); else root.style.removeProperty("overflow");
        const behavior = [root.style.getPropertyValue("scroll-behavior"), root.style.getPropertyPriority("scroll-behavior")];
        root.style.setProperty("scroll-behavior", "auto", "important");
        win!.scrollTo(x, y);
        if (behavior[0]) root.style.setProperty("scroll-behavior", behavior[0], behavior[1]); else root.style.removeProperty("scroll-behavior");
      };
    } else if (!active && restore) {
      const release = restore;
      restore = null;
      release();
    }
  }
  function canScroll(target: EventTarget | null, dx: number, dy: number) {
    if (!active || !(target instanceof win!.Node) || !active.contains(target)) return false;
    let node = target instanceof win!.HTMLElement ? target : (target as Node).parentElement;
    while (node && active.contains(node)) {
      const style = win!.getComputedStyle(node);
      const vertical = /auto|scroll/.test(style.overflowY) && ((dy < 0 && node.scrollTop > 0) || (dy > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1));
      const horizontal = /auto|scroll/.test(style.overflowX) && ((dx < 0 && node.scrollLeft > 0) || (dx > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1));
      if (vertical || horizontal) return true;
      if (node === active) break;
      node = node.parentElement;
    }
    return false;
  }
  function wheel(event: WheelEvent) {
    if (active && !event.ctrlKey && !canScroll(event.target, event.deltaX, event.deltaY)) event.preventDefault();
  }
  function touchStart(event: TouchEvent) {
    if (event.touches.length === 1) { touchX = event.touches[0].clientX; touchY = event.touches[0].clientY; }
  }
  function touchMove(event: TouchEvent) {
    if (!active || event.touches.length !== 1) return;
    const x = event.touches[0].clientX, y = event.touches[0].clientY;
    if (!canScroll(event.target, touchX - x, touchY - y)) event.preventDefault();
    touchX = x; touchY = y;
  }
  function keydown(event: KeyboardEvent) {
    if (!active || ![" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(event.key)) return;
    const target = event.target as HTMLElement | null;
    if (target && active.contains(target) && target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    const direction = ["ArrowUp", "ArrowLeft", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey) ? -1 : 1;
    if (!canScroll(target, event.key === "ArrowLeft" || event.key === "ArrowRight" ? direction : 0, event.key === "ArrowLeft" || event.key === "ArrowRight" ? 0 : direction)) event.preventDefault();
  }
  // React updates large tables and filters frequently. Only changes to dialog
  // layers need another visibility/layout scan.
  function affectsOverlay(records: MutationRecord[]) {
    return records.some((record) => {
      if (record.type === "attributes") {
        const target = record.target;
        return target instanceof win!.Element && (
          target.matches(selector)
          || target === active
          || (target !== doc.body && Boolean(active && target.contains(active)))
        );
      }
      const container = record.target;
      if (container !== doc.body && !(container instanceof win!.Element && container.closest(selector))) return false;
      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) =>
        node instanceof win!.Element && (node.matches(selector) || Boolean(node.querySelector(selector)))
      );
    });
  }
  const observer = new win.MutationObserver((records) => {
    if (affectsOverlay(records)) sync();
  });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
  doc.addEventListener("wheel", wheel, { passive: false, capture: true });
  doc.addEventListener("touchstart", touchStart, { passive: true, capture: true });
  doc.addEventListener("touchmove", touchMove, { passive: false, capture: true });
  doc.addEventListener("keydown", keydown, true);
  win.addEventListener("resize", sync);
  sync();
  return () => {
    observer.disconnect();
    doc.removeEventListener("wheel", wheel, true);
    doc.removeEventListener("touchstart", touchStart, true);
    doc.removeEventListener("touchmove", touchMove, true);
    doc.removeEventListener("keydown", keydown, true);
    win.removeEventListener("resize", sync);
    restore?.();
  };
}

if (typeof document !== "undefined") {
  const key = Symbol.for("modules.modalScrollLock");
  const state = document as Document & { [key: symbol]: (() => void) | undefined };
  const start = () => { if (!state[key]) state[key] = installModalScrollLock(); };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
