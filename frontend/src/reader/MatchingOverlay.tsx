import type { MatchingInteraction, MatchingItem } from './types';
import { matchingEndpoint, matchingHitStyle } from './overlay';
import { rotateBBox, type PageRotation } from './rotation';
import {
  isItemMatched,
  leftItemIdOf,
  parseMatchingAnswer,
  type MatchingSelection,
} from './matching';

interface Props {
  matchings: MatchingInteraction[];
  matchingAnswers: Record<string, string>;
  rotation: PageRotation;
  disabled: boolean;
  selection: MatchingSelection | null;
  onItemClick: (interactionId: string, itemId: string, side: 'left' | 'right') => void;
  onUnpair: (interactionId: string, itemId: string) => void;
  onReset: (interactionId: string) => void;
}

/**
 * In-page matching layer: selectable item hit areas plus a connection SVG.
 *
 * The printed items stay the visual source of truth. Each item is a
 * transparent keyboard-accessible button; a matched right item shows a small
 * unpair button at its anchor; pairs are drawn as thin lines between the
 * printed anchor dots, in the same normalized coordinate space as the rest
 * of the overlays, so they follow zoom and rotation automatically.
 */
export default function MatchingOverlay({
  matchings,
  matchingAnswers,
  rotation,
  disabled,
  selection,
  onItemClick,
  onUnpair,
  onReset,
}: Props) {
  return (
    <>
      {matchings.map((interaction) => {
        const pairs = parseMatchingAnswer(matchingAnswers[interaction.id]);
        const hasPairs = Object.keys(pairs).length > 0;
        const activeSelection = selection?.interactionId === interaction.id
          ? selection
          : null;
        const renderItem = (item: MatchingItem, side: 'left' | 'right') => {
          const matched = isItemMatched(pairs, item.id);
          const active = activeSelection?.itemId === item.id
            && activeSelection.side === side;
          const pairedLeft = side === 'right'
            ? leftItemIdOf(pairs, item.id)
            : null;
          const partnerText = (() => {
            if (side === 'left') {
              const rightId = pairs[item.id];
              const right = rightId
                ? interaction.rightItems.find((candidate) => candidate.id === rightId)
                : undefined;
              return right ? right.text : null;
            }
            const left = pairedLeft
              ? interaction.leftItems.find((candidate) => candidate.id === pairedLeft)
              : undefined;
            return left ? left.text : null;
          })();
          const isPairSource = side === 'right' && active;
          return (
            <div key={item.id} className={`matching-item-zone matching-item-zone-${side}`}>
              <button
                type="button"
                className={[
                  'matching-item-hit',
                  matched ? 'matching-item-matched' : '',
                  active ? 'matching-item-active' : '',
                ].filter(Boolean).join(' ')}
                aria-label={`${side === 'left' ? 'Left' : 'Right'} matching item ${
                  item.label ? `${item.label} — ` : ''
                }${item.text}${matched && partnerText ? `, matched to ${partnerText}` : ''}`}
                aria-pressed={active}
                aria-disabled={disabled}
                style={matchingHitStyle(item, side, rotation)}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onItemClick(interaction.id, item.id, side);
                }}
              >
                {matched && (
                  <span className="matching-item-dot" aria-hidden="true" />
                )}
              </button>
              {side === 'right' && pairedLeft && (
                <button
                  type="button"
                  className="matching-unpair"
                  title="Remove this pair"
                  aria-label={`Unpair ${item.label ? `${item.label} — ` : ''}${item.text}`}
                  style={matchingUnpairStyle(item, rotation)}
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onUnpair(interaction.id, item.id);
                  }}
                >
                  ✕
                </button>
              )}
              {isPairSource && (
                <span className="matching-source-dot" aria-hidden="true" />
              )}
            </div>
          );
        };
        const lines = interaction.leftItems.flatMap((left) => {
          const rightId = pairs[left.id];
          const right = interaction.rightItems.find((item) => item.id === rightId);
          if (!right) return [];
          const from = matchingEndpoint(left, 'left', rotation);
          const to = matchingEndpoint(right, 'right', rotation);
          return [{
            key: left.id,
            x1: from.x * 100,
            y1: from.y * 100,
            x2: to.x * 100,
            y2: to.y * 100,
          }];
        });
        return (
          <div key={interaction.id} className="matching-layer">
            {hasPairs && (
              <button
                type="button"
                className="matching-reset"
                title="Remove all pairs of this exercise"
                aria-label={`Reset this matching exercise (${Object.keys(pairs).length} pairs)`}
                style={matchingResetStyle(interaction, rotation)}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onReset(interaction.id);
                }}
              >
                Reset
              </button>
            )}
            <svg
              className="matching-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {lines.map((line) => (
                <g key={line.key}>
                  <line
                    className="matching-line-halo"
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                  />
                  <line
                    className="matching-line"
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                  />
                </g>
              ))}
            </svg>
            {interaction.leftItems.map((item) => renderItem(item, 'left'))}
            {interaction.rightItems.map((item) => renderItem(item, 'right'))}
          </div>
        );
      })}
    </>
  );
}

function matchingUnpairStyle(
  item: MatchingItem,
  rotation: PageRotation = 0,
) {
  const anchor = item.anchorBbox;
  if (anchor) {
    const rotated = rotateBBox(anchor, rotation);
    return {
      left: `${percent(rotated.x + rotated.width / 2)}%`,
      top: `${percent(rotated.y + rotated.height / 2)}%`,
    };
  }
  const bbox = rotateBBox(item.bbox, rotation);
  return {
    left: `${percent(bbox.x)}%`,
    top: `${percent(bbox.y + bbox.height / 2)}%`,
  };
}

function matchingResetStyle(
  interaction: MatchingInteraction,
  rotation: PageRotation = 0,
) {
  const bbox = rotateBBox(interaction.bbox, rotation);
  return {
    right: `${percent(1 - bbox.x - bbox.width)}%`,
    top: `${percent(Math.max(0, bbox.y - 0.012))}%`,
  };
}

function percent(value: number): number {
  return Math.round(value * 100 * 10000) / 10000;
}
