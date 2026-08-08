import { useCallback, useState } from 'react';
import type { AnswerKey, AnswerKeyEntry } from '../api/correction';
import {
  CorrectionVerdict,
  type CorrectionState,
  emptyCorrectionState,
  writeRevealBit,
} from './correction';
import {
  computeCorrectionMap,
} from '../reader/correction';
import type {
  ExerciseBlank,
  ChoiceTarget,
  ChoiceGrid,
  ChoiceGroup,
  SentenceOrderingInteraction,
  MatchingInteraction,
  FreeTextInteraction,
} from '../reader/types';

function findEntry(
  entries: AnswerKeyEntry[],
  pageNumber: number,
  interactionKind: string,
  index: number,
): AnswerKeyEntry | undefined {
  const matching = entries.filter(
    (e) => e.pageNumber === pageNumber && e.interactionKind === interactionKind,
  );
  matching.sort((a, b) => a.ordinal - b.ordinal);
  return matching[index];
}

interface UseCorrectionParams {
  bookId: string;
  pageNumber: number;
  answers: Record<string, string>;
  blanks: ExerciseBlank[];
  choices: ChoiceTarget[];
  choiceGroups: Record<string, ChoiceGroup>;
  grids: ChoiceGrid[];
  sentenceOrderings: SentenceOrderingInteraction[];
  matchings: MatchingInteraction[];
  freeTexts: FreeTextInteraction[];
  answerKey: AnswerKey | null;
  initialReveal: Record<string, boolean>;
}

export interface UseCorrectionReturn {
  state: CorrectionState;
  check: () => void;
  retry: (itemId: string) => void;
  reveal: (itemId: string) => void;
  isRevealed: (itemId: string) => boolean;
  totalCorrect: number;
  totalGradable: number;
}

export function useCorrection(params: UseCorrectionParams): UseCorrectionReturn {
  const {
    bookId,
    pageNumber,
    answers,
    blanks,
    choices,
    choiceGroups,
    grids,
    sentenceOrderings,
    matchings,
    freeTexts,
    answerKey,
    initialReveal,
  } = params;

  const [state, setState] = useState<CorrectionState>(() => ({
    ...emptyCorrectionState(),
    reveal: { ...initialReveal },
  }));

  const check = useCallback(() => {
    if (!answerKey) return;

    const entries = answerKey.entries;

    const blankInputs = blanks.map((blank, index) => ({
      id: blank.id,
      blank,
      learnerValue: answers[blank.id],
      entry: findEntry(entries, pageNumber, 'fill-in-line', index),
    }));

    const choiceInputs = choices.map((choice, index) => ({
      id: choice.id,
      choice,
      learnerValue: answers[choice.id],
      entry: findEntry(entries, pageNumber, 'choice', index),
    }));

    const gridInputs = grids.map((grid, index) => ({
      id: grid.id,
      grid,
      learnerValues: Object.fromEntries(
        grid.rows.map((row) => [row.id, answers[row.id]]),
      ),
      rows: grid.rows,
      entry: findEntry(entries, pageNumber, 'choice-grid', index),
    }));

    const orderingInputs = sentenceOrderings.map((ordering, index) => ({
      id: ordering.id,
      ordering,
      learnerValue: answers[ordering.id],
      entry: findEntry(entries, pageNumber, 'sentence-ordering', index),
    }));

    const matchingInputs = matchings.map((matching, index) => ({
      id: matching.id,
      matching,
      learnerValue: answers[matching.id],
      entry: findEntry(entries, pageNumber, 'matching', index),
    }));

    const freeTextInputs = freeTexts.map((freeText) => ({
      id: freeText.id,
      freeText,
      learnerValue: answers[freeText.id],
    }));

    const result = computeCorrectionMap({
      blanks: blankInputs,
      choices: choiceInputs,
      choiceGroups,
      grids: gridInputs,
      orderings: orderingInputs,
      matchings: matchingInputs,
      freeTexts: freeTextInputs,
    });

    setState((prev) => ({
      verdictByItem: { ...result.verdictByItem },
      resolutionByItem: { ...result.resolutionByItem },
      resultDetailsByItem: { ...result.resultDetailsByItem },
      uiState: 'CHECKED',
      reveal: { ...prev.reveal },
    }));
  }, [answerKey, answers, blanks, choices, choiceGroups, grids, sentenceOrderings, matchings, freeTexts, pageNumber]);

  const retry = useCallback((itemId: string) => {
    setState((prev) => {
      const nextVerdict = { ...prev.verdictByItem };
      delete nextVerdict[itemId];
      const nextResolution = { ...prev.resolutionByItem };
      delete nextResolution[itemId];
      const nextDetails = { ...prev.resultDetailsByItem };
      delete nextDetails[itemId];
      const nextReveal = { ...prev.reveal };
      delete nextReveal[itemId];

      writeRevealBit(bookId, pageNumber, itemId, false);

      return {
        verdictByItem: nextVerdict,
        resolutionByItem: nextResolution,
        resultDetailsByItem: nextDetails,
        uiState: 'RETRYING',
        reveal: nextReveal,
      };
    });
  }, [bookId, pageNumber]);

  const reveal = useCallback((itemId: string) => {
    setState((prev) => {
      const nextReveal = { ...prev.reveal, [itemId]: true };
      writeRevealBit(bookId, pageNumber, itemId, true);
      return {
        ...prev,
        uiState: 'REVEALED',
        reveal: nextReveal,
      };
    });
  }, [bookId, pageNumber]);

  const isRevealed = useCallback(
    (itemId: string) => state.reveal[itemId] === true,
    [state.reveal],
  );

  const totalCorrect = Object.values(state.verdictByItem).filter(
    (v) => v === CorrectionVerdict.CORRECT,
  ).length;

  const totalGradable = Object.values(state.verdictByItem).filter(
    (v) => v !== CorrectionVerdict.NOT_AUTO_GRADABLE,
  ).length;

  return {
    state,
    check,
    retry,
    reveal,
    isRevealed,
    totalCorrect,
    totalGradable,
  };
}
