import { useRef, useState } from 'react';
import { ArabicKeyboard } from './ArabicKeyboard';

interface RecallInputProps {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  placeholder?: string;
  disabled?: boolean;
  /** Input is Arabic text (RTL + offer the on-screen keyboard). */
  arabic?: boolean;
  autoFocus?: boolean;
}

/**
 * Input field for active recall. With `arabic`, RTL is set and a toggleable
 * Arabic on-screen keyboard (including harakāt) is offered.
 */
export function RecallInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  arabic = true,
  autoFocus,
}: RecallInputProps) {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const insert = (ch: string) => {
    onChange(value + ch);
    inputRef.current?.focus();
  };

  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <div className="row">
        <input
          ref={inputRef}
          className={`input ${arabic ? 'arabic-inline' : ''}`}
          dir={arabic ? 'rtl' : 'ltr'}
          lang={arabic ? 'ar' : 'de'}
          // Translations: no OS autocorrect/capitalisation interfering with recall.
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            }
          }}
          style={{ fontSize: '1.4rem' }}
          aria-label="Antwort eingeben"
        />
        {arabic && (
          <button
            type="button"
            className="btn"
            aria-pressed={showKeyboard}
            onClick={() => setShowKeyboard((v) => !v)}
            title="Arabische Tastatur"
          >
            ⌨
          </button>
        )}
      </div>
      {arabic && showKeyboard && (
        <ArabicKeyboard
          onInsert={insert}
          onBackspace={() => onChange(value.slice(0, -1))}
          onSpace={() => insert(' ')}
        />
      )}
    </div>
  );
}
