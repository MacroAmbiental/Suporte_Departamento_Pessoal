import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

export default function useCreateShortcut(onCreate: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeydown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
      if (event.key.toLowerCase() !== "m") return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      onCreate();
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [enabled, onCreate]);
}