export const LESSON_PROGRESS_KEY = 'lexora.lessonProgress.v1';

interface LessonProgressStore {
  version: 1;
  stepByLesson: Record<string, string>;
}

function emptyStore(): LessonProgressStore {
  return { version: 1, stepByLesson: {} };
}

function readStore(storage: Pick<Storage, 'getItem'>): LessonProgressStore {
  try {
    const raw = storage.getItem(LESSON_PROGRESS_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as LessonProgressStore;
    if (parsed?.version !== 1 || !parsed.stepByLesson) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function readLessonStep(
  lessonId: string,
  validStepIds: string[],
  storage: Pick<Storage, 'getItem'> = localStorage,
): string {
  const saved = readStore(storage).stepByLesson[lessonId];
  return saved && validStepIds.includes(saved) ? saved : validStepIds[0] ?? '';
}

export function writeLessonStep(
  lessonId: string,
  stepId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  const store = readStore(storage);
  storage.setItem(LESSON_PROGRESS_KEY, JSON.stringify({
    ...store,
    stepByLesson: { ...store.stepByLesson, [lessonId]: stepId },
  }));
}
