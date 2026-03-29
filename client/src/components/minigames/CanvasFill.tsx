import { useCallback, useRef } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

export function CanvasFill({ onScoreUpdate }: MinigameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filledPixels = useRef(0);
  const lastSoundStroke = useRef(0);

  const handleDraw = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${(filledPixels.current * 3) % 360}, 80%, 60%)`;
      ctx.fill();

      filledPixels.current += 1;
      onScoreUpdate(filledPixels.current);
      if (filledPixels.current - lastSoundStroke.current >= 10) {
        lastSoundStroke.current = filledPixels.current;
        SFX.minigameBrush();
      }
    },
    [onScoreUpdate]
  );

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={400}
      style={styles.canvas}
      onPointerMove={handleDraw}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  canvas: {
    borderRadius: '12px',
    background: '#112240',
    touchAction: 'none',
    maxWidth: '100%',
  },
};
