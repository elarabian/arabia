import React from 'react';
import { GameEngine } from '../game/gameEngine';
import { BROADCAST } from '../game/broadcast';

export const HUD: React.FC<{ engine: GameEngine }> = ({ engine }) => (
  <div className="absolute pointer-events-none z-20 text-center" style={{
    top: `${BROADCAST.top*100}%`, left: `${BROADCAST.left*100}%`,
    right: `${BROADCAST.right*100}%`,
  }}>
    {engine.dialogueText && <div role="status" aria-live="polite"
      className="inline-block rounded-2xl bg-amber-50/95 px-5 py-3 font-bold text-amber-950 shadow-lg"
      style={{fontSize:'clamp(18px, 4.2cqw, 32px)',lineHeight:1.25,maxWidth:'100%'}}>
      {engine.dialogueText}
    </div>}
  </div>
);
