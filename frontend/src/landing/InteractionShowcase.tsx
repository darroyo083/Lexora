import { useMemo, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';

type Family = 'Fill blank' | 'Choice' | 'Choice grid' | 'Sentence ordering' | 'Matching' | 'Free text';
const families: Family[] = ['Fill blank', 'Choice', 'Choice grid', 'Sentence ordering', 'Matching', 'Free text'];

function Status({ correct, neutral = false }: { correct: boolean | null; neutral?: boolean }) {
  if (correct === null) return null;
  return <p className="showcase-status" role="status" data-state={neutral ? 'neutral' : correct ? 'correct' : 'retry'}>{neutral ? 'Saved locally. This open response stays ungraded.' : correct ? 'Correct. The source answer matches.' : 'Try again. The source answer is different.'}</p>;
}

function FillBlankExample() {
  const [value, setValue] = useState(''); const [result, setResult] = useState<boolean | null>(null);
  return <div className="showcase-exercise"><p>Ergänze den Satz mit dem passenden Verb.</p><label>Jeden Morgen <input value={value} onChange={(event) => { setValue(event.target.value); setResult(null); }} aria-label="Missing verb" /> ich um sieben Uhr auf.</label><button type="button" onClick={() => setResult(value.trim().toLowerCase() === 'stehe')} disabled={!value.trim()}><Check size={16} aria-hidden="true" /> Check answers</button><Status correct={result} /></div>;
}

function ChoiceExample() {
  const [value, setValue] = useState(''); const [result, setResult] = useState<boolean | null>(null);
  return <div className="showcase-exercise"><fieldset><legend>Wann stehst du auf?</legend>{['Um sieben Uhr', 'Im Park', 'Mit Anna'].map((option) => <label key={option}><input type="radio" name="showcase-choice" value={option} checked={value === option} onChange={() => { setValue(option); setResult(null); }} /><span>{option}</span></label>)}</fieldset><button type="button" onClick={() => setResult(value === 'Um sieben Uhr')} disabled={!value}><Check size={16} aria-hidden="true" /> Check answers</button><Status correct={result} /></div>;
}

function GridExample() {
  const [values, setValues] = useState<Record<string, string>>({}); const [result, setResult] = useState<boolean | null>(null);
  const rows = [['Bahnhof', 'der'], ['Apotheke', 'die']];
  return <div className="showcase-exercise showcase-grid" role="group" aria-label="Choose the correct article"><div className="grid-heading"><span>Word</span><span>der</span><span>die</span><span>das</span></div>{rows.map(([word]) => <div className="grid-row" key={word}><strong>{word}</strong>{['der', 'die', 'das'].map((article) => <label key={article}><span className="sr-only">{word}: {article}</span><input type="radio" name={`grid-${word}`} checked={values[word] === article} onChange={() => { setValues((current) => ({ ...current, [word]: article })); setResult(null); }} /></label>)}</div>)}<button type="button" disabled={Object.keys(values).length < 2} onClick={() => setResult(rows.every(([word, answer]) => values[word] === answer))}><Check size={16} aria-hidden="true" /> Check answers</button><Status correct={result} /></div>;
}

function OrderingExample() {
  const tokens = ['Wir', 'treffen', 'uns', 'am', 'Samstag']; const [ordered, setOrdered] = useState<string[]>([]); const [result, setResult] = useState<boolean | null>(null);
  return <div className="showcase-exercise"><p>Bringe die Wörter in die richtige Reihenfolge.</p><div className="showcase-order-result" aria-live="polite">{ordered.join(' ') || 'Select the words in order.'}</div><div className="showcase-tokens">{['Samstag', 'uns', 'Wir', 'am', 'treffen'].map((token) => <button key={token} type="button" aria-pressed={ordered.includes(token)} disabled={ordered.includes(token)} onClick={() => { setOrdered((items) => [...items, token]); setResult(null); }}>{token}</button>)}</div><div className="showcase-actions"><button type="button" onClick={() => { setOrdered([]); setResult(null); }}><RotateCcw size={16} aria-hidden="true" /> Reset order</button><button type="button" disabled={ordered.length !== tokens.length} onClick={() => setResult(ordered.join('|') === tokens.join('|'))}><Check size={16} aria-hidden="true" /> Check answers</button></div><Status correct={result} /></div>;
}

function MatchingExample() {
  const left = ['Bäckerei', 'Bahnhof'];
  const right = ['Brot', 'Züge'];
  const [selected, setSelected] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<boolean | null>(null);
  const pairedRight = useMemo(() => new Set(Object.values(pairs)), [pairs]);

  const chooseLeft = (item: string) => {
    setSelected((current) => current === item ? null : item);
    setResult(null);
  };

  const chooseRight = (item: string) => {
    if (!selected) return;
    setPairs((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([leftItem, rightItem]) => leftItem === selected || rightItem !== item),
      );
      next[selected] = item;
      return next;
    });
    setSelected(null);
    setResult(null);
  };

  const reset = () => {
    setPairs({});
    setSelected(null);
    setResult(null);
  };

  const instruction = selected
    ? `Now choose the matching item for ${selected}.`
    : Object.keys(pairs).length === left.length
      ? 'Both pairs are connected. You can check them now.'
      : 'Choose a place on the left, then its matching item on the right.';

  return (
    <div className="showcase-exercise showcase-matching">
      <p className="showcase-match-instruction" aria-live="polite">{instruction}</p>
      <div className="showcase-match" aria-label="Match places with related items">
        <div className="showcase-match-column" aria-label="Places">
          <span className="showcase-match-label">Place</span>
          {left.map((item, index) => (
            <button type="button" key={item} data-selected={selected === item}
              data-paired={Boolean(pairs[item])} aria-pressed={selected === item}
              aria-label={`${item}${pairs[item] ? `, paired with ${pairs[item]}` : ', not paired yet'}`}
              onClick={() => chooseLeft(item)}>
              <span className="showcase-match-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="showcase-match-word">{item}</span>
              <span className="showcase-match-pair">{pairs[item] ?? 'Choose'}</span>
            </button>
          ))}
        </div>
        <div className="showcase-match-column" aria-label="Matching items">
          <span className="showcase-match-label">Matches with</span>
          {right.map((item, index) => (
            <button type="button" key={item} disabled={!selected}
              data-paired={pairedRight.has(item)} aria-pressed={pairedRight.has(item)}
              aria-label={`${item}${pairedRight.has(item) ? ', already paired' : ''}`}
              onClick={() => chooseRight(item)}>
              <span className="showcase-match-index">{String.fromCharCode(65 + index)}</span>
              <span className="showcase-match-word">{item}</span>
              <span className="showcase-match-pair">{pairedRight.has(item) ? 'Paired' : selected ? 'Pair' : 'Waiting'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="showcase-match-actions">
        <button type="button" disabled={Object.keys(pairs).length < left.length}
          onClick={() => setResult(pairs.Bäckerei === 'Brot' && pairs.Bahnhof === 'Züge')}>
          <Check size={16} aria-hidden="true" /> Check answers
        </button>
        {Object.keys(pairs).length > 0 && (
          <button type="button" className="showcase-reset" onClick={reset}>
            <RotateCcw size={15} aria-hidden="true" /> Reset pairs
          </button>
        )}
      </div>
      <Status correct={result} />
    </div>
  );
}

function FreeTextExample() {
  const [value, setValue] = useState(''); return <div className="showcase-exercise"><label htmlFor="showcase-writing">Schreibe einen Satz über deinen Morgen.</label><textarea id="showcase-writing" rows={3} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Am Morgen ..." /><Status correct={value.trim() ? false : null} neutral /></div>;
}

export default function InteractionShowcase() {
  const [family, setFamily] = useState<Family>('Fill blank');
  const selectFamily = (nextFamily: Family) => {
    if (nextFamily === family) return;
    setFamily(nextFamily);
  };
  return <section className="interaction-showcase" aria-labelledby="showcase-title"><div className="section-copy"><h2 id="showcase-title">Try the interaction language.</h2><p>Each example behaves like a small Lexora exercise, including grouped answers and conservative feedback.</p></div><div className="showcase-layout"><div className="showcase-tabs" role="tablist" aria-label="Exercise families">{families.map((item) => <button type="button" key={item} role="tab" aria-selected={family === item} onClick={() => selectFamily(item)}>{item}</button>)}</div><div className="showcase-stage" role="tabpanel" aria-label={`${family} example`}><div className="showcase-stage-body" key={family}><div className="showcase-stage-heading"><span>Example exercise</span><h3>{family}</h3></div>{family === 'Fill blank' && <FillBlankExample />}{family === 'Choice' && <ChoiceExample />}{family === 'Choice grid' && <GridExample />}{family === 'Sentence ordering' && <OrderingExample />}{family === 'Matching' && <MatchingExample />}{family === 'Free text' && <FreeTextExample />}</div></div></div></section>;
}
