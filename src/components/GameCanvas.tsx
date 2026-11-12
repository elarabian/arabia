import React, { useEffect, useRef, useCallback } from 'react';
import { BROADCAST } from '../game/broadcast';
import { soundEngine } from '../game/audio';
import { GameEngine } from '../game/gameEngine';

const MAX_CANVAS_PIXELS = 1080 * 1920;

interface GameCanvasProps {
  engine: GameEngine;
  isPaused: boolean;
  onStatsUpdate: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ engine, isPaused, onStatsUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevMouseRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const isMouseDownRef = useRef<boolean>(false);

  useEffect(() => {
    soundEngine.setPaused(isPaused);
    return () => soundEngine.setPaused(true);
  }, [isPaused]);

  // Resize canvas to container
  const handleResize = useCallback(() => {
    if (!containerRef.current || !canvasRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    const deviceScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    const pixelScale = Math.min(deviceScale, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    const outputWidth = Math.max(1, Math.round(width * pixelScale));
    const outputHeight = Math.max(1, Math.round(height * pixelScale));
    if (canvasRef.current.width !== outputWidth) canvasRef.current.width = outputWidth;
    if (canvasRef.current.height !== outputHeight) canvasRef.current.height = outputHeight;
    canvasRef.current.style.width = `${width}px`;
    canvasRef.current.style.height = `${height}px`;

    const logicalHeight = BROADCAST.height;
    const logicalWidth = width / height * logicalHeight;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.setTransform(outputWidth / logicalWidth, 0, 0, outputHeight / logicalHeight, 0, 0);
    }
    engine.resize(logicalWidth, logicalHeight);
  }, [engine]);

  // Pointer / Mouse interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPaused) return;
    isMouseDownRef.current = true;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) * engine.width / rect.width;
    const y = (e.clientY - rect.top) * engine.height / rect.height;

    // Trigger instant snap impulse towards clicked position
    engine.snapAt(x, y, 1.25);
    prevMouseRef.current = { x, y, time: performance.now() };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPaused || !isMouseDownRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentX = (e.clientX - rect.left) * engine.width / rect.width;
    const currentY = (e.clientY - rect.top) * engine.height / rect.height;
    const now = performance.now();

    const dt = (now - prevMouseRef.current.time) / 1000;
    if (dt > 0.005) {
      const dx = currentX - prevMouseRef.current.x;
      const dy = currentY - prevMouseRef.current.y;
      const speed = Math.hypot(dx, dy) / dt;

      // If mouse is flicked rapidly, inject energy into whip nodes
      if (speed > 400) {
        const power = Math.min(2.0, speed / 800);
        engine.snapAt(currentX, currentY, power * 0.7);
      }

      prevMouseRef.current = { x: currentX, y: currentY, time: now };
    }
  };

  const handlePointerUp = () => {
    isMouseDownRef.current = false;
  };

  // Main animation loop
  useEffect(() => {
    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);

    let animationFrameId: number;
    let lastTime = performance.now();
    let pendingSeconds = 0;

    const advance = (time: number) => {
      const elapsed = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;
      if (isPaused || !canvasRef.current) {
        pendingSeconds = 0;
        return;
      }

      pendingSeconds += elapsed;
      let updates = 0;
      while (pendingSeconds > 0.0001 && updates < 120) {
        const dt = Math.min(pendingSeconds, 0.05);
        engine.update(dt);
        pendingSeconds -= dt;
        updates++;
      }
      if (updates) onStatsUpdate();

      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, engine.width, engine.height);
        engine.render(ctx, time);
      }
    };

    const loop = (time: number) => {
      animationFrameId = requestAnimationFrame(loop);
      if (!document.hidden) advance(time);
    };

    // Browsers suspend animation frames for hidden tabs. Timers keep the game
    // advancing, and elapsed time is caught up when a throttled timer resumes.
    const backgroundTimer = window.setInterval(() => {
      if (document.hidden) advance(performance.now());
    }, 100);
    const resume = () => {
      advance(performance.now());
      if (!document.hidden && !isPaused) soundEngine.setPaused(false);
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(backgroundTimer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
    };
  }, [engine, isPaused, handleResize, onStatsUpdate]);

  // Keyboard controls for skills
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPaused) return;
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyQ') {
        engine.castWhirlwind();
      } else if (e.code === 'KeyE') {
        engine.castShockwave();
      } else if (e.code === 'Space') {
        // Snap whip in forward direction
        engine.snapNearest();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine, isPaused]);

  return (
    <div ref={containerRef} className="relative w-full h-full select-none cursor-crosshair overflow-hidden">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="block touch-none"
      />
    </div>
  );
};
