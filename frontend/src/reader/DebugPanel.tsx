import type { TextSpan } from './types';

interface Props {
  span: TextSpan | null;
}

export default function DebugPanel({ span }: Props) {
  if (!span) {
    return (
      <aside className="debug-panel">
        <h2>Debug</h2>
        <p className="debug-hint">Click a word to inspect</p>
      </aside>
    );
  }

  return (
    <aside className="debug-panel">
      <h2>Debug</h2>
      <dl>
        <dt>Text</dt>
        <dd>{span.text}</dd>

        <dt>Confidence</dt>
        <dd>{(span.confidence * 100).toFixed(1)}%</dd>

        <dt>Confidence scope</dt>
        <dd>{span.confidenceScope}</dd>

        <dt>BBox (norm)</dt>
        <dd>
          x={span.bbox.x.toFixed(4)}{' '}
          y={span.bbox.y.toFixed(4)}{' '}
          w={span.bbox.width.toFixed(4)}{' '}
          h={span.bbox.height.toFixed(4)}
        </dd>

        <dt>Span ID</dt>
        <dd><code>{span.id}</code></dd>

        {span.parentLineId && (
          <>
            <dt>Line</dt>
            <dd><code>{span.parentLineId}</code></dd>
          </>
        )}
      </dl>
    </aside>
  );
}
