"""Generate real MP3 dialogue files using edge-tts; an internet connection is required.
Voice and prosody controls do not guarantee expressive pain acting.
Reference: https://github.com/rany2/edge-tts
"""
import asyncio
import json
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOUNDS = ROOT / 'sounds'

def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

def validate(path):
    data=json.loads(run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(path)]).stdout)
    duration=float(data['format']['duration'])
    if not .3 < duration < 30:
        raise RuntimeError(f'Geçersiz ses süresi: {path.name}')
    output=run(['ffmpeg','-hide_banner','-i',str(path),'-af','volumedetect','-f','null','-']).stderr
    match=re.search(r'max_volume: ([\-\w.]+) dB',output)
    if not match or not math.isfinite(float(match[1])) or float(match[1]) < -45:
        raise RuntimeError(f'Dosya sessiz veya çok düşük: {path.name}')
    return duration

async def main():
    import edge_tts
    for tool in ['ffmpeg','ffprobe']:
        if not shutil.which(tool): raise RuntimeError(f'{tool} bulunamadı.')
    manifest=json.loads((SOUNDS/'dialogue-production.json').read_text())
    voices=await edge_tts.list_voices()
    female=[v for v in voices if v.get('Gender')=='Female']
    def choose(locale):
        voice=next((v['ShortName'] for v in female if v.get('Locale')==locale),None)
        if not voice: raise RuntimeError(f'{locale} kadın sesi bulunamadı.')
        return voice
    tr,en=choose('tr-TR'),choose('en-US')
    completed=[]
    with tempfile.TemporaryDirectory(prefix='kirbac-voices-') as work:
        work=Path(work)
        for i,clip in enumerate(manifest['clips']):
            destination=SOUNDS/clip['filename']
            if destination.exists():
                duration=validate(destination)
                print(f'Mevcut, doğrulandı: {destination.name}',flush=True)
            else:
                print(f'Üretiliyor: {destination.name}',flush=True)
                raw=work/f'{i}-raw.mp3'
                await edge_tts.Communicate(clip['text'],voice=en if 'come to' in clip['text'] else tr,
                    rate=['-12%','-6%','+0%'][i%3],pitch=['+12Hz','+18Hz','+8Hz'][i%3]).save(str(raw))
                validate(raw)
                candidate=work/destination.name
                run(['ffmpeg','-v','error','-y','-i',str(raw),'-af','loudnorm=I=-18:TP=-2:LRA=7',
                    '-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','192k',str(candidate)])
                duration=validate(candidate)
                shutil.copyfile(candidate,destination)
            clip.update(status='generated',duration=round(duration,3))
            completed.append(destination)
        # Concatenated listening preview with short silences between lines.
        preview_inputs=[]
        for i,path in enumerate(completed):
            wav=work/f'{i}.wav'
            run(['ffmpeg','-v','error','-y','-i',str(path),'-af','apad=pad_dur=0.5','-ar','44100','-ac','1',str(wav)])
            preview_inputs.append(f"file '{wav}'")
        listing=work/'playlist.txt';listing.write_text('\n'.join(preview_inputs))
        preview=work/'dialogue-preview.mp3'
        run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-codec:a','libmp3lame','-b:a','192k',str(preview)])
        shutil.copyfile(preview,SOUNDS/preview.name)
    manifest['status']='generated_requires_listening_review'
    manifest['generator']='edge-tts; female neural voice, adjusted speech rate and pitch; no acted-emotion guarantee'
    (SOUNDS/'dialogue-production.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'9 MP3 ve dinleme önizlemesi hazır: {SOUNDS}',flush=True)

if __name__=='__main__':
    try: asyncio.run(main())
    except Exception as exc:
        raise SystemExit(f'Ses üretimi tamamlanamadı: {exc}')
