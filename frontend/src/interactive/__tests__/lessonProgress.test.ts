import { describe, expect, it } from 'vitest';
import { LESSON_PROGRESS_KEY, readLessonStep, writeLessonStep } from '../lessonProgress';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('lesson progress', () => {
  it('restores a valid step and rejects stale projection identities', () => {
    const storage = memoryStorage();
    writeLessonStep('book:page:1', 'step-2', storage);
    expect(readLessonStep('book:page:1', ['step-1', 'step-2'], storage)).toBe('step-2');
    expect(readLessonStep('book:page:1', ['replacement-step'], storage)).toBe('replacement-step');
  });

  it('fails closed when stored progress is malformed', () => {
    const storage = memoryStorage({ [LESSON_PROGRESS_KEY]: '{broken' });
    expect(readLessonStep('lesson', ['first'], storage)).toBe('first');
  });
});
