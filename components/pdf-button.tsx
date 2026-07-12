"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, Printer, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Print / Download PDF" — opens the document PDF in a popup (embedded viewer)
 * with Print and Download actions, instead of navigating to a new tab.
 */
export function PdfButton({
  url,
  filename,
  label = "Print / Download PDF",
}: {
  url: string;
  filename?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function print() {
    const win = iframeRef.current?.contentWindow;
    try {
      win?.focus();
      win?.print();
    } catch {
      window.open(url, "_blank");
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileDown className="h-4 w-4 mr-2" />
        {label}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 animate-in fade-in" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl h-[88vh] bg-background rounded-lg border shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
              <div className="font-semibold text-sm">Document preview</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={print}>
                  <Printer className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Print</span>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={url} download={filename}>
                    <Download className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                </Button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <iframe ref={iframeRef} src={url} title="PDF preview" className="flex-1 w-full bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
