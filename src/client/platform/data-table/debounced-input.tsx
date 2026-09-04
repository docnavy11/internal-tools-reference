import { useEffect, useRef, useState } from 'react';
import { Input } from '@/client/platform/ui/input';

/**
 * Text input that writes to the URL after the user stops typing. The committed value
 * is the prop: when it changes for another reason (back button, cleared chip) the box
 * follows, but not while a debounce is in flight.
 */
export function DebouncedInput({
  value,
  onCommit,
  delay = 300,
  ...props
}: {
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value);
  const [committed, setCommitted] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (value !== committed) {
    setCommitted(value);
    setText(value);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Input
      {...props}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(next), delay);
      }}
    />
  );
}
