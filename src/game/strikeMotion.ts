/** Shared arm / torso / rope timing, aligned to the recorded crack. */
export function strikeMotion(age:number,peak:number,power:number,windup?:number) {
  if (windup !== undefined) {
    if (age < 0) {
      const p = Math.max(0, Math.min(1, windup));
      return {pullback:p,release:0,extension:22-32*p,lift:60*p,lean:-6*p*power};
    }
    if (age < peak) {
      const release = Math.sin(Math.min(1, age / peak) * Math.PI / 2);
      const pullback = 1-release;
      return {pullback,release,extension:-10+42*release,lift:60*pullback+4*release,
        lean:(-6*pullback+11*release)*power};
    }
    const rise = Math.max(0, Math.min(1, (age-peak)/.45));
    const settle = Math.exp(-(age-peak)/.16);
    return {pullback:0,release:1,
      extension:(24+8*settle)*(1-rise)-10*rise,
      lift:4*settle*(1-rise)+60*rise,
      lean:11*power*settle*(1-rise)-6*power*rise};
  }
  if(age<0)return {pullback:0,release:0,extension:22,lift:0,lean:0};
  const phase=age/peak;
  if(phase<.6){
    const p=Math.sin(phase/.6*Math.PI/2);
    return {pullback:p,release:0,extension:22-40*p,lift:24*p,lean:-6*p*power};
  }
  if(phase<1){
    const release=Math.pow((phase-.6)/.4,2.6),pullback=1-release;
    return {pullback,release,extension:-18+50*release,lift:24*pullback+4*release,
      lean:(-6*pullback+11*release)*power};
  }
  const settle=Math.exp(-(age-peak)/.16);
  return {pullback:0,release:1,extension:24+8*settle,lift:4*settle,lean:11*power*settle};
}
