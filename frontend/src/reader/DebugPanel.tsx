import type { BBox, ChoiceTarget, ExerciseBlank, TextSpan } from './types';

interface Props {
  span: TextSpan | null;
  blank: ExerciseBlank | null;
  choice: ChoiceTarget | null;
}

function BboxValue({ bbox }: { bbox: BBox }) {
  return <>x={bbox.x.toFixed(4)} y={bbox.y.toFixed(4)} w={bbox.width.toFixed(4)} h={bbox.height.toFixed(4)}</>;
}

export default function DebugPanel({ span, blank, choice }: Props) {
  if (!span && !blank && !choice) {
    return (
      <aside className="debug-panel">
        <h2>Debug</h2>
        <p className="debug-hint">Click an OCR word or focus an interaction to inspect it</p>
      </aside>
    );
  }

  return (
    <aside className="debug-panel">
      <h2>Debug</h2>
      <dl>
        {choice && (
          <>
            <dt>Target ID</dt>
            <dd><code>{choice.id}</code></dd>
            <dt>Kind</dt>
            <dd>{choice.kind}</dd>
            <dt>Score</dt>
            <dd>{choice.candidateScore.toFixed(3)}</dd>
            <dt>Detection</dt>
            <dd>{choice.detectionMethod}</dd>
            <dt>Option group</dt>
            <dd>{choice.optionGroupId ?? 'None'}</dd>
            <dt>Physical target</dt>
            <dd><BboxValue bbox={choice.targetBbox} /></dd>
            <dt>Interaction</dt>
            <dd><BboxValue bbox={choice.interactionBbox} /></dd>
            <dt>Nearby spans</dt>
            <dd>{choice.nearbyTextSpanIds.join(', ') || 'None'}</dd>
          </>
        )}

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
