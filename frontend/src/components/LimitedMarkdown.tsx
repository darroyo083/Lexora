import type { ReactNode } from 'react';

function withoutUnsafeLinks(value: string): string {
  // Links are deliberately rendered as text-only labels. React escapes the
  // remaining text, so workbook/provider output cannot introduce HTML or
  // event handlers into the reader.
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

function inline(value: string, keyPrefix: string): ReactNode[] {
  const safe = withoutUnsafeLinks(value);
  const tokenPattern = /(\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*]+\*(?!\*)|(?<!_)_[^_]+_(?!_)|`[^`]+`)/g;
  const output: ReactNode[] = [];
  let cursor = 0;
  let token: RegExpExecArray | null;
  let tokenIndex = 0;
  while ((token = tokenPattern.exec(safe)) !== null) {
    if (token.index > cursor) output.push(safe.slice(cursor, token.index));
    const raw = token[0];
    const key = `${keyPrefix}-${tokenIndex++}`;
    if (raw.startsWith('**') || raw.startsWith('__')) {
      output.push(<strong key={key}>{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith('*') || raw.startsWith('_')) {
      output.push(<em key={key}>{raw.slice(1, -1)}</em>);
    } else {
      output.push(<code key={key}>{raw.slice(1, -1)}</code>);
    }
    cursor = token.index + raw.length;
  }
  if (cursor < safe.length) output.push(safe.slice(cursor));
  return output;
}

function unorderedItem(line: string): string | null {
  const markdownBullet = line.match(/^\s*[-+*]\s+(.+)$/);
  if (markdownBullet) return markdownBullet[1];
  const typographicDash = line.match(/^\s*[–—]\s+(.+)$/);
  if (typographicDash) return typographicDash[1];
  const typographicBullet = line.match(/^\s*[•◦▪‣]\s*(.+)$/);
  return typographicBullet?.[1] ?? null;
}

export default function LimitedMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let blockIndex = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `paragraph-${blockIndex++}`;
    blocks.push(<p key={key}>{inline(paragraph.map((line) => line.trim()).join(' '), key)}</p>);
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      const key = `heading-${blockIndex++}`;
      blocks.push(<h3 key={key}>{inline(heading[1], key)}</h3>);
      index += 1;
      continue;
    }

    const unordered: string[] = [];
    while (index < lines.length) {
      const item = unorderedItem(lines[index]);
      if (item === null) break;
      unordered.push(item);
      index += 1;
    }
    if (unordered.length > 0) {
      flushParagraph();
      const key = `unordered-${blockIndex++}`;
      blocks.push(<ul key={key}>{unordered.map((item, itemIndex) => (
        <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>
      ))}</ul>);
      continue;
    }

    const ordered: string[] = [];
    while (index < lines.length) {
      const match = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
      if (!match) break;
      ordered.push(match[1]);
      index += 1;
    }
    if (ordered.length > 0) {
      flushParagraph();
      const key = `ordered-${blockIndex++}`;
      blocks.push(<ol key={key}>{ordered.map((item, itemIndex) => (
        <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>
      ))}</ol>);
      continue;
    }

    paragraph.push(line);
    index += 1;
  }
  flushParagraph();

  return <div className="ask-lexora-markdown">{blocks}</div>;
}
