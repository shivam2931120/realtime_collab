import { useLayoutEffect, useRef } from "react";
import { DocItem } from "../store/docStore";
import RenameDocumentForm from "./RenameDocumentForm";

export default function RenameDocumentDialog({ document, onClose }: { document: DocItem; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])');
      if (!controls?.length) { event.preventDefault(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.document.addEventListener("keydown", handleKey);
    return () => { window.document.removeEventListener("keydown", handleKey); window.document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="rename-heading">
    <div ref={panel} className="editorial-panel w-full max-w-md p-5 sm:p-6">
      <h2 id="rename-heading" className="mb-5 text-xl font-semibold text-on-surface">Rename document</h2>
      <RenameDocumentForm documentId={document.id} title={document.title} onSaved={onClose} onCancel={onClose} />
    </div>
  </div>;
}
