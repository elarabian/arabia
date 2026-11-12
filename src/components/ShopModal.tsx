import React from 'react';
import { GameEngine } from '../game/gameEngine';
import { WHIP_CONFIGS } from '../game/whip';
import { WhipType } from '../game/types';
import { X, Sparkles, Plus, Heart, Zap, Flame, Shield } from 'lucide-react';
import { soundEngine } from '../game/audio';

interface ShopModalProps {
  engine: GameEngine;
  onClose: () => void;
  onRefresh: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({ engine, onClose, onRefresh }) => {
  const whips: WhipType[] = ['LEATHER', 'CHAIN', 'SHOCK', 'HELLFIRE'];

  const handleSelectOrBuyWhip = (whipType: WhipType) => {
    const config = WHIP_CONFIGS[whipType];
    if (config.unlocked) {
      engine.setWhipType(whipType);
      soundEngine.playChainRattle();
      onRefresh();
    } else {
      if (engine.stats.bloodEssence >= config.cost) {
        engine.stats.bloodEssence -= config.cost;
        config.unlocked = true;
        engine.setWhipType(whipType);
        soundEngine.playWhipCrack(1.2, config.soundType);
        onRefresh();
      }
    }
  };

  const handleUpgradeReach = () => {
    const cost = engine.stats.whipReachLevel * 90;
    if (engine.stats.bloodEssence >= cost && engine.stats.whipReachLevel < 6) {
      engine.stats.bloodEssence -= cost;
      engine.stats.whipReachLevel++;
      engine.setWhipType(engine.whip.config.id);
      soundEngine.playChainRattle();
      onRefresh();
    }
  };

  const handleUpgradePower = () => {
    const cost = engine.stats.whipPowerLevel * 110;
    if (engine.stats.bloodEssence >= cost && engine.stats.whipPowerLevel < 6) {
      engine.stats.bloodEssence -= cost;
      engine.stats.whipPowerLevel++;
      soundEngine.playBoneSnap();
      onRefresh();
    }
  };

  const handleHeal = () => {
    const cost = 45;
    if (engine.stats.bloodEssence >= cost && engine.stats.hp < engine.stats.maxHp) {
      engine.stats.bloodEssence -= cost;
      engine.stats.hp = Math.min(engine.stats.maxHp, engine.stats.hp + 50);
      soundEngine.playFireExplosion();
      onRefresh();
    }
  };

  const handleUpgradeMaxHp = () => {
    const cost = 160;
    if (engine.stats.bloodEssence >= cost) {
      engine.stats.bloodEssence -= cost;
      engine.stats.maxHp += 25;
      engine.stats.hp += 25;
      soundEngine.playFleshImpact(true);
      onRefresh();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-stone-950 border border-stone-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-900/60">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="font-cinzel text-lg font-bold text-stone-100 tracking-wide">
                Karanlık Cephanelik & Demircilik
              </h2>
              <div className="text-xs text-stone-400">
                Kan Özü ile kırbaçlarınızı ve Harami'nin yeteneklerini güçlendirin
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-stone-950 border border-stone-800 rounded-lg text-amber-400 font-medium text-xs">
              <span>🩸</span>
              <span className="font-mono tabular-nums font-bold text-sm">{engine.stats.bloodEssence}</span>
              <span className="text-stone-500 text-[11px]">Kan Özü</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Section 1: Whip Arsenal */}
          <div>
            <h3 className="font-cinzel text-sm font-semibold uppercase tracking-wider text-amber-500 mb-3">
              Kırbaç Koleksiyonu
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {whips.map((wId) => {
                const config = WHIP_CONFIGS[wId];
                const isEquipped = engine.whip.config.id === wId;
                const canAfford = engine.stats.bloodEssence >= config.cost;

                return (
                  <div
                    key={wId}
                    className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${
                      isEquipped
                        ? 'bg-amber-950/20 border-amber-600/80 shadow-md'
                        : 'bg-stone-900/40 border-stone-800 hover:border-stone-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: config.tipColor }}
                          />
                          <span className="font-cinzel font-bold text-stone-200 text-sm">
                            {config.nameTr}
                          </span>
                        </div>
                        {isEquipped && (
                          <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded">
                            Kuşanıldı
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-stone-400 mb-3 leading-relaxed">
                        {config.descriptionTr}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-stone-400 mb-3">
                        <span>Hasar: {config.baseDamage}</span>
                        <span aria-hidden="true">·</span>
                        <span>Kritik: {config.critMultiplier}x</span>
                        <span aria-hidden="true">·</span>
                        <span>Menzil: {config.segments} halka</span>
                      </div>
                    </div>

                    {config.unlocked ? (
                      <button
                        onClick={() => handleSelectOrBuyWhip(wId)}
                        disabled={isEquipped}
                        className={`w-full py-1.5 px-3 rounded text-xs font-semibold tracking-wider transition-colors cursor-pointer ${
                          isEquipped
                            ? 'bg-stone-800 text-stone-500 cursor-default'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
                        }`}
                      >
                        {isEquipped ? 'Kuşanıldı' : 'Kuşan'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSelectOrBuyWhip(wId)}
                        disabled={!canAfford}
                        className={`w-full py-1.5 px-3 rounded text-xs font-semibold tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                          canAfford
                            ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold'
                            : 'bg-stone-900 text-stone-600 cursor-not-allowed border border-stone-800'
                        }`}
                      >
                        <span>Kilidi Aç:</span>
                        <span className="font-mono">{config.cost}</span>
                        <span>🩸 Kan Özü</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Upgrades */}
          <div>
            <h3 className="font-cinzel text-sm font-semibold uppercase tracking-wider text-amber-500 mb-3">
              Harami Geliştirmeleri
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Reach */}
              <div className="p-3.5 bg-stone-900/40 border border-stone-800 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-cinzel font-semibold text-stone-200 text-xs">
                    Kırbaç Uzunluğu & Halka Sayısı
                  </div>
                  <div className="text-[11px] text-stone-400">
                    Seviye: {engine.stats.whipReachLevel} / 6
                  </div>
                </div>
                <button
                  onClick={handleUpgradeReach}
                  disabled={engine.stats.bloodEssence < engine.stats.whipReachLevel * 90 || engine.stats.whipReachLevel >= 6}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed text-amber-400 rounded text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  {engine.stats.whipReachLevel >= 6 ? 'Maks' : `${engine.stats.whipReachLevel * 90} 🩸`}
                </button>
              </div>

              {/* Power */}
              <div className="p-3.5 bg-stone-900/40 border border-stone-800 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-cinzel font-semibold text-stone-200 text-xs">
                    Kırbaç Darbe Gücü (+%20)
                  </div>
                  <div className="text-[11px] text-stone-400">
                    Seviye: {engine.stats.whipPowerLevel} / 6
                  </div>
                </div>
                <button
                  onClick={handleUpgradePower}
                  disabled={engine.stats.bloodEssence < engine.stats.whipPowerLevel * 110 || engine.stats.whipPowerLevel >= 6}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed text-amber-400 rounded text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  {engine.stats.whipPowerLevel >= 6 ? 'Maks' : `${engine.stats.whipPowerLevel * 110} 🩸`}
                </button>
              </div>

              {/* Heal */}
              <div className="p-3.5 bg-stone-900/40 border border-stone-800 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-cinzel font-semibold text-stone-200 text-xs flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-500" />
                    <span>Şifa İksiri (+50 Can)</span>
                  </div>
                  <div className="text-[11px] text-stone-400">
                    Mevcut: {Math.ceil(engine.stats.hp)} / {engine.stats.maxHp}
                  </div>
                </div>
                <button
                  onClick={handleHeal}
                  disabled={engine.stats.bloodEssence < 45 || engine.stats.hp >= engine.stats.maxHp}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed text-rose-400 rounded text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  45 🩸
                </button>
              </div>

              {/* Max HP */}
              <div className="p-3.5 bg-stone-900/40 border border-stone-800 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-cinzel font-semibold text-stone-200 text-xs flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-sky-500" />
                    <span>Maksimum Dayanıklılık (+25 HP)</span>
                  </div>
                  <div className="text-[11px] text-stone-400">
                    Toplam Can Havuzu: {engine.stats.maxHp}
                  </div>
                </div>
                <button
                  onClick={handleUpgradeMaxHp}
                  disabled={engine.stats.bloodEssence < 160}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed text-sky-400 rounded text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  160 🩸
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-800 bg-stone-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-cinzel font-semibold tracking-wider transition-colors cursor-pointer"
          >
            Savaşa Dön
          </button>
        </div>
      </div>
    </div>
  );
};
