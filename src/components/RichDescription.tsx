import { Fragment } from 'react';
import { isSafeExternalUrl } from '../utils/icsExport';

interface RichDescriptionProps {
  text?: string;
}

function renderInlineSegments(line: string) {
  // Split on **bold** or http(s):// URLs safely without innerHTML
  const tokenRegex = /(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g;
  const parts = line.split(tokenRegex);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if ((part.startsWith('https://') || part.startsWith('http://')) && isSafeExternalUrl(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-700 break-all"
        >
          {part}
        </a>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

export function RichDescription({ text }: RichDescriptionProps) {
  if (!text || !text.trim()) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No description provided.
      </p>
    );
  }

  const lines = text.split(/\r?\n/);
  const blocks: { type: 'heading' | 'list' | 'paragraph'; items: string[] }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', items: [line.slice(3).trim()] });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'list') {
        last.items.push(line.slice(2).trim());
      } else {
        blocks.push({ type: 'list', items: [line.slice(2).trim()] });
      }
    } else {
      blocks.push({ type: 'paragraph', items: [line] });
    }
  }

  return (
    <div className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h4
              key={index}
              className="text-xs font-semibold text-slate-900 dark:text-slate-100 tracking-tight pt-1"
            >
              {block.items[0]}
            </h4>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="list-disc pl-5 space-y-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInlineSegments(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{renderInlineSegments(block.items[0])}</p>;
      })}
    </div>
  );
}
