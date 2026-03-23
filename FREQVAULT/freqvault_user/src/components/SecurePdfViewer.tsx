import { useEffect, useRef, useState } from "react";

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (params: { scale: number }) => { width: number; height: number };
        render: (params: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
      destroy: () => void;
    }>;
    destroy: () => void;
  };
  version?: string;
};

interface SecurePdfViewerProps {
  src: string;
  className?: string;
}

export const SecurePdfViewer = ({ src, className = "" }: SecurePdfViewerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<PdfJsModule["getDocument"]> | null = null;
    let loadedPdf: { destroy: () => void } | null = null;

    const renderPdf = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const host = containerRef.current;
        if (!host) return;
        host.innerHTML = "";

        const pdfjs = (await import("pdfjs-dist")) as unknown as PdfJsModule;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        loadingTask = pdfjs.getDocument(src);
        const pdf = await loadingTask.promise;
        loadedPdf = pdf;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "mx-auto w-full max-w-4xl rounded border border-border bg-white shadow-sm";
          canvas.setAttribute("aria-label", `PDF page ${pageNumber}`);

          await page.render({
            canvasContext: context,
            viewport
          }).promise;

          if (cancelled) return;
          const wrapper = document.createElement("div");
          wrapper.className = "mb-4";
          wrapper.appendChild(canvas);
          host.appendChild(wrapper);
        }
      } catch {
        if (!cancelled) {
          setError("Secure PDF preview failed to load.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void renderPdf();

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy();
      }
      if (loadedPdf) {
        loadedPdf.destroy();
      }
    };
  }, [src]);

  return (
    <div className={`relative ${className}`}>
      {isLoading ? (
        <div className="rounded border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          Loading secure PDF preview...
        </div>
      ) : null}
      {error ? (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={`${isLoading || error ? "hidden" : "block"} max-h-[75vh] min-h-[520px] overflow-auto p-2`}
      />
    </div>
  );
};
