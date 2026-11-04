/** Splitter trascinabile per ridimensionare i pannelli. */
import { useCallback } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

interface SplitterProps {
  orientation: 'v' | 'h';
  onDelta: (delta: number) => void;
}

export function Splitter({ orientation, onDelta }: SplitterProps): JSX.Element {
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      let last = orientation === 'v' ? e.clientX : e.clientY;

      const move = (ev: PointerEvent) => {
        const current = orientation === 'v' ? ev.clientX : ev.clientY;
        const delta = current - last;
        last = current;
        if (delta !== 0) onDelta(delta);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    [orientation, onDelta],
  );

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-orientation={orientation === 'v' ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
    />
  );
}
