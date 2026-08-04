import { useEffect, useRef } from 'react';
import type { ChoiceGroup, ChoiceTarget } from './types';
import type { PageRotation } from './rotation';
import { choiceSelectorStyle } from './overlay';

interface Props {
  group: ChoiceGroup;
  target: ChoiceTarget;
  viewportHeight: number;
  rotation: PageRotation;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  onClose: () => void;
}

export default function ChoiceSelector({
  group,
  target,
  viewportHeight,
  rotation,
  selectedOptionId,
  onSelect,
  onClose,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focusButton = (button: HTMLButtonElement | null | undefined) => {
      button?.focus();
    };
    const buttons = () => Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const initial = (selectedOptionId
      ? buttons().find((button) => button.getAttribute('aria-selected') === 'true')
      : buttons()[0]) ?? buttons()[0];
    focusButton(initial);

    const restoreFocus = () => {
      focusButton(document.querySelector<HTMLButtonElement>(
        'button.choice-hit[aria-expanded="true"]',
      ));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restoreFocus();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const current = buttons().indexOf(document.activeElement as HTMLButtonElement);
        if (current === -1) return;
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        focusButton(buttons()[(current + direction + buttons().length) % buttons().length]);
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [onClose, selectedOptionId]);

  const select = (optionId: string) => {
    const targetButton = document.querySelector<HTMLButtonElement>(
      'button.choice-hit[aria-expanded="true"]',
    );
    targetButton?.focus();
    onSelect(optionId);
  };

  return (
    <div
      ref={rootRef}
      role="listbox"
      aria-label="Choose an answer"
      className="choice-selector"
      style={choiceSelectorStyle(target, viewportHeight, rotation)}
    >
      {group.options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="option"
          aria-selected={option.id === selectedOptionId}
          className={`choice-option${option.id === selectedOptionId ? ' choice-option-selected' : ''}`}
          onClick={() => select(option.id)}
        >
          {option.label}
        </button>
      ))}
      <button
        type="button"
        className="choice-clear"
        aria-label="Clear answer"
        onClick={() => select('')}
      >
        ×
      </button>
    </div>
  );
}
