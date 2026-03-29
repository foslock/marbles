import { useEffect, useRef } from 'react';

/**
 * Canvas-based procedural fireworks.
 * Uses position: absolute to fill its containing block — place it as the
 * FIRST child of a `position: relative/absolute/fixed` container so sibling
 * content renders on top via normal DOM paint order.
 */

interface Props {
  intensity?: 'normal' | 'intense';
}

const COLORS = [
  '#f39c12', '#e74c3c', '#3498db', '#2ecc71',
  '#9b59b6', '#f1c40f', '#e67e22', '#ffffff', '#ff6b9d',
];

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;   // 1 → 0
  decay: number;  // subtracted per second
  color: string;
  radius: number;
  isRocket: boolean;
  targetY?: number;
}

export function Fireworks({ intensity = 'normal' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Keep canvas pixel dimensions in sync with its CSS layout size
    const syncSize = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        canvas.width  = r.width;
        canvas.height = r.height;
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    const particles: Particle[] = [];

    const explode = (x: number, y: number, color: string) => {
      const count = intensity === 'intense'
        ? 38 + Math.floor(Math.random() * 20)
        : 24 + Math.floor(Math.random() * 14);

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = 55 + Math.random() * 190;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life:  0.85 + Math.random() * 0.15,
          decay: 0.65 + Math.random() * 0.75,
          color,
          radius: 2 + Math.random() * 2.5,
          isRocket: false,
        });
      }
    };

    const launchRocket = () => {
      const x      = 60 + Math.random() * Math.max(1, canvas.width - 120);
      const targetY = canvas.height * (0.08 + Math.random() * 0.45);
      const color   = COLORS[Math.floor(Math.random() * COLORS.length)];
      particles.push({
        x,
        y: canvas.height + 6,
        vx: (Math.random() - 0.5) * 55,
        vy: -480 - Math.random() * 280,
        life: 1, decay: 0,
        color, radius: 2.5,
        isRocket: true, targetY,
      });
    };

    const spawnMs  = intensity === 'intense' ? 300 : 720;
    const perSpawn = intensity === 'intense' ? 2 : 1;
    let lastSpawn  = 0;
    let lastT      = 0;
    let rafId: number;

    const tick = (now: number) => {
      const dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
      lastT = now;

      if (now - lastSpawn >= spawnMs) {
        for (let i = 0; i < perSpawn; i++) launchRocket();
        lastSpawn = now;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (p.isRocket) {
          p.vy += 55 * dt;   // slight drag on ascent
          p.y  += p.vy * dt;
          p.x  += p.vx * dt;

          // Rocket dot
          ctx.globalAlpha = 0.9;
          ctx.fillStyle   = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();

          // Tiny trail sparkle just behind
          ctx.globalAlpha = 0.35;
          ctx.fillStyle   = '#fff';
          ctx.beginPath();
          ctx.arc(p.x - p.vx * 0.006, p.y - p.vy * 0.006, 1.2, 0, Math.PI * 2);
          ctx.fill();

          if (p.y <= (p.targetY ?? 0)) {
            explode(p.x, p.y, p.color);
            particles.splice(i, 1);
          }
        } else {
          p.vy += 145 * dt;               // gravity
          p.vx *= Math.pow(0.82, dt);     // horizontal drag
          p.x  += p.vx * dt;
          p.y  += p.vy * dt;
          p.life -= p.decay * dt;

          if (p.life <= 0 || p.y > canvas.height + 20) {
            particles.splice(i, 1);
            continue;
          }

          // Quadratic fade + shrink as the particle ages
          ctx.globalAlpha = Math.max(0, p.life * p.life);
          ctx.fillStyle   = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * Math.max(0.1, p.life), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
