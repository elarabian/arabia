import React, { useEffect, useRef, useCallback } from 'react';
import { BROADCAST } from '../game/broadcast';
import { soundEngine } from '../game/audio';
import { GameEngine } from '../game/gameEngine';

const OBS_CANVAS_WIDTH = 1080;
const OBS_CANVAS_HEIGHT = 1920;

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
  const renderScaleRef = useRef(1);

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

    const outputWidth = Math.round(OBS_CANVAS_WIDTH * renderScaleRef.current);
    const outputHeight = Math.round(OBS_CANVAS_HEIGHT * renderScaleRef.current);
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
    let lastAdvanceAt = lastTime;
    let lastStatsUpdate = lastTime;
    let slowFrames = 0;
    let resolutionPending = false;

    const advance = (time: number) => {
      const elapsed = Math.max(0, Math.min(.1, (time - lastTime) / 1000));
      lastTime = time;
      lastAdvanceAt = time;
      if (isPaused || !canvasRef.current) {
        return;
      }
      if (resolutionPending) {
        handleResize();
        resolutionPending = false;
      }

      // A suspended or throttled browser source should resume smoothly, without
      // replaying seconds of simulation on a single animation frame.
      let remaining = elapsed;
      while (remaining > 0.0001) {
        const dt = Math.min(remaining, 0.05);
        engine.update(dt);
        remaining -= dt;
      }
      if (time - lastStatsUpdate >= 200 || engine.isGameOver) {
        lastStatsUpdate = time;
        onStatsUpdate();
      }

      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const renderStart = performance.now();
        ctx.clearRect(0, 0, engine.width, engine.height);
        engine.render(ctx, time);
        const renderCost = performance.now() - renderStart;
        slowFrames = renderCost > 18 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
        if (slowFrames >= 18 && renderScaleRef.current > 2 / 3) {
          renderScaleRef.current = renderScaleRef.current === 1 ? .75 : 2 / 3;
          slowFrames = 0;
          resolutionPending = true;
        }
      }
    };

    const loop = (time: number) => {
      animationFrameId = requestAnimationFrame(loop);
      // Embedded LIVE/OBS browsers can report hidden while still being captured.
      if (time - lastAdvanceAt >= 8) advance(time);
    };

    // If a source suspends requestAnimationFrame, keep drawing through a timer.
    // Avoid double drawing while animation frames are arriving normally.
    const backgroundTimer = window.setInterval(() => {
      const now = performance.now();
      if (now - lastAdvanceAt > 15) advance(now);
    }, 16);
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
