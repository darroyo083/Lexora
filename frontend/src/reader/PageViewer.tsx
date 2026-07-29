import { useEffect, useRef, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { TextSpan } from './types';
import { documentToViewport } from '../coordinates/transforms';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

interface Props {
  pdfData: ArrayBuffer;
  pageNumber: number;
  spans: TextSpan[];
  zoom: number;
  showBoxes: boolean;
  onSpanClick: (span: TextSpan) => void;
}

export default function PageViewer({
  pdfData,
  pageNumber,
  spans,
  zoom,
  showBoxes,
  onSpanClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewportDims = useRef({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const load = async () => {
      const pdf = await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise;
      if (cancelled) return;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });
      viewportDims.current = { width: viewport.width, height: viewport.height };

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      await page.render({ canvasContext: ctx, viewport }).promise;
    };

    load();
    return () => { cancelled = true; };
  }, [pdfData, pageNumber, zoom]);

  const overlaySpans = useMemo(() => {
    const vw = viewportDims.current.width;
    const vh = viewportDims.current.height;
    if (vw === 0 || vh === 0) return [];
    return spans.map((s) => {
      const pos = documentToViewport(s.bbox, vw, vh);
      return { ...s, ...pos };
    });
  }, [spans, viewportDims.current.width, viewportDims.current.height]);

  return (
    <div ref={containerRef} className="page-container">
      <div className="page-stack">
        <canvas ref={canvasRef} className="page-canvas" />
        <div className="page-overlay" style={{ pointerEvents: showBoxes ? 'auto' : 'auto' }}>
          {showBoxes &&
            overlaySpans.map((s) => (
              <div
                key={s.id}
                className="ocr-box"
                title={`${s.text} (${(s.confidence * 100).toFixed(0)}%)`}
                style={{
                  left: s.left,
                  top: s.top,
                  width: s.width,
                  height: s.height,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSpanClick(s);
                }}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
