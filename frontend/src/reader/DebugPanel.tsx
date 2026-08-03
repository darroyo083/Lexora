import type { BBox, ExerciseBlank, TextSpan } from './types';

interface Props {
  span: TextSpan | null;
  blank: ExerciseBlank | null;
}

function BboxValue({ bbox }: { bbox: BBox }) {
  return <>x={bbox.x.toFixed(4)} y={bbox.y.toFixed(4)} w={bbox.width.toFixed(4)} h={bbox.height.toFixed(4)}</>;
}

export default function DebugPanel({ span, blank }: Props) {
  if (!span && !blank) {
    return (
      <aside className="debug-panel">
        <h2>Debug</h2>
        <p className="debug-hint">Click an OCR word or focus a blank to inspect it</p>
      </aside>
    );
  }

  return (
    <aside className="debug-panel">
      <h2>Debug</h2>
      <dl>
        {blank && (
          <>
            <dt>Blank ID</dt>
            <dd><code>{blank.id}</code></dd>
            <dt>Kind</dt>
            <dd>{blank.kind}</dd>
            <dt>Score</dt>
            <dd>{blank.candidateScore.toFixed(3)}</dd>
            <dt>Detection</dt>
            <dd>{blank.detectionMethod}</dd>
            <dt>Physical line</dt>
            <dd><BboxValue bbox={blank.lineBbox} /></dd>
            <dt>Interaction</dt>
            <dd><BboxValue bbox={blank.interactionBbox} /></dd>
            <dt>Nearby spans</dt>
            <dd>{blank.nearbyTextSpanIds.join(', ') || 'None'}</dd>
          </>
        )}

        {span && (
          <>
            <dt>Text</dt>
            <dd>{span.text}</dd>

            <dt>Confidence</dt>
            <dd>{(span.confidence * 100).toFixed(1)}%</dd>

            <dt>Confidence scope</dt>
            <dd>{span.confidenceScope}</dd>

            <dt>BBox (norm)</dt>
            <dd><BboxValue bbox={span.bbox} /></dd>

            <dt>Span ID</dt>
            <dd><code>{span.id}</code></dd>

            {span.parentLineId && (
              <>
                <dt>Line</dt>
                <dd><code>{span.parentLineId}</code></dd>
              </>
            )}
          </>
        )}
      </dl>
    </aside>
  );
}
