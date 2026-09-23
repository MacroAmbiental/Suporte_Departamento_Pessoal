import { createPortal } from "react-dom";
import type { HTMLAttributes } from "react";

/** Render dialog layers outside the scaled application shell. */
export default function ModalPortal({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  if (typeof document === "undefined") return null;
  return createPortal(<div {...props}>{children}</div>, document.body);
}
