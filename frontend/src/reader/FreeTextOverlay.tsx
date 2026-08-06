import type { FreeTextInteraction, TextSpan } from './types';
import { freeTextInputStyle } from './overlay';
import type { PageRotation } from './rotation';

interface Props {
  freeTexts: FreeTextInteraction[];
  answers: Record<string, string>;
  spans: TextSpan[];
  viewportHeight: number;
  rotation: PageRotation;
  disabled: boolean;
  onFreeTextChange: (interactionId: string, value: string) => void;
}

/**
 * In-page FreeText layer: one writing control per response area.
 *
 * The printed page stays the visual source of truth. A single-line response
 * area renders one text input centered on the printed line; a multi-line
 * area renders one textarea whose line height matches the printed line
 * spacing, so typed text lands on the printed lines. Both use the shared
 * normalized geometry (`freeTextInputStyle`), so they follow zoom and
 * rotation like every other overlay.
 */
export default function FreeTextOverlay({
  freeTexts,
  answers,
  spans,
  viewportHeight,
  rotation,
  disabled,
  onFreeTextChange,
}: Props) {
  return (
    <>
      {freeTexts.map((interaction) => {
        const promptText = interaction.nearbyTextSpanIds
          .map((id) => spans.find((span) => span.id === id)?.text)
          .filter(Boolean)
          .join(' ') || interaction.id;
        const style = freeTextInputStyle(interaction, viewportHeight, rotation);
        const common = {
          className: 'free-text-input',
          'aria-label': `Write your answer near ${promptText}`,
          value: answers[interaction.id] ?? '',
          disabled,
          autoComplete: 'off',
          spellCheck: false,
        };
        if (interaction.responseLines.length <= 1) {
          return (
            <input
              key={interaction.id}
              type="text"
              style={style}
              {...common}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onFreeTextChange(interaction.id, event.target.value)}
            />
          );
        }
        return (
          <textarea
            key={interaction.id}
            rows={1}
            wrap="soft"
            style={style}
            {...common}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onFreeTextChange(interaction.id, event.target.value)}
          />
        );
      })}
    </>
  );
}
