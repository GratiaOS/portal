import { useEffect, useRef, useState } from 'react';
import type { Strings } from '../lib/strings.ts';

/** Code as it was written: in its own box, in a fixed-width font, scrolling sideways instead of breaking lines, with a way to copy it. */
export default function CodeBlock({ lang, code, t }: { lang: string; code: string; t: Strings }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // some browsers refuse outside a secure page; the text can still be selected and copied by hand
    }
  };

  return (
    <figure data-part="code">
      <figcaption data-part="code-head">
        <span data-part="code-lang">{lang}</span>
        <button type="button" onClick={() => void copy()} data-part="code-copy">
          <span aria-live="polite">{copied ? t.copied : t.copy}</span>
        </button>
      </figcaption>
      <pre data-part="code-body" tabIndex={0} aria-label={lang || undefined}>
        <code>{code.replace(/\n+$/, '')}</code>
      </pre>
    </figure>
  );
}
