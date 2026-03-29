import { useCallback, useRef } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

export function CanvasFill({ onScoreUpdate }: MinigameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const totalDist = useRef(0);
  const lastSoundDist = useRef(0);

  const getPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    // Scale from CSS pixels to canvas pixels
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    lastPos.current = pos;
    // Draw a dot at the touch point so single taps register
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `hsl(${(totalDist.current * 0.6) % 360}, 85%, 62%)`;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + 0.1, pos.y);
    ctx.stroke();
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!lastPos.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pos = getPos(e);
      const segLen = Math.hypot(pos.x - lastPos.current.x, pos.y - lastPos.current.y);

      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `hsl(${(totalDist.current * 0.6) % 360}, 85%, 62%)`;
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      lastPos.current = pos;
      totalDist.current += segLen;
      // Score = distance drawn / 5 (keeps numbers reasonable)
      onScoreUpdate(Math.floor(totalDist.current / 5));

      if (totalDist.current - lastSoundDist.current >= 80) {
        lastSoundDist.current = totalDist.current;
        SFX.minigameBrush();
      }
    },
    [onScoreUpdate],
  );

  const endStroke = useCallback(() => {
    lastPos.current = null;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={400}
      style={styles.canvas}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerLeave={endStroke}
      onPointerCancel={endStroke}
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
