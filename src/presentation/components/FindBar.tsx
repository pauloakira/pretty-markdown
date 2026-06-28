import { useEffect, useRef } from "react";

interface FindBarProps {
  query: string;
  count: number;
  index: number;
  onQueryChange: (q: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export function FindBar({
  query,
  count,
  index,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const status = count > 0 ? `${index + 1}/${count}` : query ? "0/0" : "";

  return (
    <div className="findbar" role="search">
      <input
        ref={inputRef}
        className="findbar__input"
        type="text"
        placeholder="Find in document"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrevious();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="findbar__count">{status}</span>
      <button
        className="findbar__btn"
        aria-label="Previous match"
        onClick={onPrevious}
        disabled={count === 0}
      >
        ↑
      </button>
      <button
        className="findbar__btn"
        aria-label="Next match"
        onClick={onNext}
        disabled={count === 0}
      >
        ↓
      </button>
      <button className="findbar__btn" aria-label="Close find" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
