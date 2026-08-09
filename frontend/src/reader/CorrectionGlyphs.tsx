import { Check, X, Eye } from 'lucide-react';
import {
  CorrectionVerdict,
} from '../state/correction';
import { bboxPercentageStyle } from './overlay';
import type { BBox } from './types';
import type { PageRotation } from './rotation';

interface CorrectionGlyphsProps {
  blanks: Array<{ id: string; interactionBbox: BBox }>;
  choices: Array<{ id: string; targetBbox: BBox; optionGroupId: string | null }>;
  grids: Array<{
    id: string;
    rows: Array<{ id: string; rowBbox: BBox; cells: Array<{ id: string; cellBbox: BBox }> }>;
  }>;
  verdictByItem: Record<string, CorrectionVerdict | undefined>;
  rotation: PageRotation;
  viewportHeight: number;
  suppressed: boolean;
}

export default function CorrectionGlyphs({
  blanks,
  choices,
  grids,
  verdictByItem,
  rotation,
  viewportHeight: _viewportHeight,
  suppressed,
}: CorrectionGlyphsProps) {
  if (suppressed) return null;

  return (
    <div className="correction-glyphs" aria-hidden="true">
      {blanks.map((blank) => {
        const verdict = verdictByItem[blank.id];
        if (!verdict) return null;
        return (
          <div
            key={blank.id}
            className={`correction-ring correction-ring-blank ${verdictClass(verdict)}`}
            style={bboxPercentageStyle(blank.interactionBbox, rotation)}
          >
            {verdictGlyph(verdict)}
          </div>
        );
      })}

      {choices.map((choice) => {
        const verdict = verdictByItem[choice.id];
        if (!verdict) return null;
        return (
          <div
            key={choice.id}
            className={`correction-ring correction-ring-choice ${verdictClass(verdict)}`}
            style={bboxPercentageStyle(choice.targetBbox, rotation)}
          >
            {verdictGlyph(verdict)}
          </div>
        );
      })}

      {grids.flatMap((grid) =>
        grid.rows.map((row) => {
          const verdict = verdictByItem[grid.id];
          if (!verdict) return null;

          if (verdict === CorrectionVerdict.INCORRECT || verdict === CorrectionVerdict.PARTIALLY_CORRECT) {
            return (
              <div
                key={row.id}
                className="correction-ring correction-ring-grid-row incorrect"
                style={bboxPercentageStyle(row.rowBbox, rotation)}
              />
            );
          }
          return null;
        }),
      )}
    </div>
  );
}

function verdictClass(verdict: CorrectionVerdict): string {
  switch (verdict) {
    case CorrectionVerdict.CORRECT:
      return 'correct';
    case CorrectionVerdict.INCORRECT:
      return 'incorrect';
    case CorrectionVerdict.PARTIALLY_CORRECT:
      return 'partial';
    case CorrectionVerdict.UNANSWERED:
      return 'unanswered';
    case CorrectionVerdict.NOT_AUTO_GRADABLE:
      return 'not-auto-gradable';
  }
}

function verdictGlyph(verdict: CorrectionVerdict) {
  switch (verdict) {
    case CorrectionVerdict.CORRECT:
      return <Check size={14} className="correction-glyph-icon correction-glyph-ok" />;
    case CorrectionVerdict.INCORRECT:
      return <X size={14} className="correction-glyph-icon correction-glyph-err" />;
    case CorrectionVerdict.NOT_AUTO_GRADABLE:
      return <Eye size={14} className="correction-glyph-icon correction-glyph-neutral" />;
    default:
      return null;
  }
}
