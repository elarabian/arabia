"""Offline comic reaction edit. Preserves original speech; does not synthesize acted emotion."""
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
import array
import wave
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOUNDS=ROOT/'sounds'
ORIGINALS=SOUNDS/'original-dialogues'

def run(args):
    return subprocess.run(args,check=True,capture_output=True,text=True)

def duration(path):
    return float(json.loads(run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(path)]).stdout)['format']['duration'])

def spans(path):
    length=duration(path)
    log=run(['ffmpeg','-hide_banner','-i',str(path),'-af','silencedetect=n=-34dB:d=0.10','-f','null','-']).stderr
    cursor=0.; result=[]
    for line in log.splitlines():
        start=re.search(r'silence_start: ([\d.]+)',line)
        end=re.search(r'silence_end: ([\d.]+)',line)
        if start:
            finish=float(start[1])
            if finish-cursor>.07:result.append((max(0,cursor-.025),min(length,finish+.045)))
        if end:cursor=float(end[1])
    if length-cursor>.07:result.append((max(0,cursor-.025),length))
    return result

def edit_piece(source,start,end,out,pitch=1.,tempo=1.,strained=True):
    # Preserve speech clarity: only cut at measured quiet boundaries.
    filters=[f'atrim=start={start}:end={end}','asetpts=PTS-STARTPTS',
             f'asetrate={44100*pitch}', 'aresample=44100', f'atempo={tempo/pitch}',
             'highpass=f=85', 'equalizer=f=2100:t=q:w=0.8:g=2.0',
             "volume='1.15+0.25*sin(2*PI*3.0*t)':eval=frame"]
    if strained:
        # Trembling, strained delivery: faster/deeper tremolo+vibrato plus a
        # touch of soft-clip rasp for a pained edge, still intelligible.
        filters+=['tremolo=f=7.5:d=0.22','vibrato=f=6.5:d=0.2',
                   'volume=1.6','asoftclip=type=tanh:param=0.6','volume=0.625',
                   'aexciter=amount=1.4']
    filters+=['afade=t=in:d=0.008','areverse','afade=t=in:d=0.014','areverse']
    run(['ffmpeg','-v','error','-y','-i',str(source),'-af',','.join(filters),'-ar','44100','-ac','1',str(out)])

def sustained_a(source,out,seconds=.85):
    """Pitch-synchronous sustain of the /a/ in 'yandım', excluding the TTS 'ey'.

    Reuse real voiced grains instead of stretching an incorrectly pronounced word.
    Standard library only, so the offline editor needs no extra Python packages.
    """
    rate=16000
    pcm=subprocess.run(['ffmpeg','-v','error','-i',str(source),'-f','s16le',
                        '-ac','1','-ar',str(rate),'-'],capture_output=True,check=True).stdout
    samples=array.array('h',pcm)
    # Measured open-a nucleus, before the nasal /n/ and after the initial /y/.
    vowel=[v/32768 for v in samples[int(1.84*rate):int(1.92*rate)]]
    period=max(range(35,100),key=lambda lag:sum(vowel[i]*vowel[i+lag] for i in range(len(vowel)-lag))/(len(vowel)-lag))
    centers=[]
    center=max(range(period,period*2),key=lambda i:vowel[i])
    while center+period<len(vowel):
        centers.append(center)
        expected=center+period
        lo,hi=expected-4,min(expected+5,len(vowel)-period)
        if lo>=hi:break
        center=max(range(lo,hi),key=lambda i:vowel[i])
    size=int(seconds*rate);output=[0.]*(size+period*3);weights=[0.]*len(output)
    position=period;grain=0
    while position<size:
        center=centers[(grain//3)%len(centers)]
        for offset in range(-period,period):
            dest=round(position)+offset
            if 0<=dest<len(output):
                weight=.5+.5*math.cos(math.pi*offset/period)
                output[dest]+=vowel[center+offset]*weight
                weights[dest]+=weight
        t=position/size
        # Scream contour: a sharp pitch spike on attack that swoops down into
        # a trembling sustain, instead of the earlier near-flat drone.
        pitch=1.1+.55*math.exp(-5*t)+.05*math.sin(2*math.pi*7*t)
        position+=period/pitch;grain+=1
    result=array.array('h')
    for i in range(size):
        t=i/rate
        envelope=min(1,t/.02)*min(1,(seconds-t)/.16)
        envelope*=.86+.14*math.sin(2*math.pi*6.5*t)
        value=output[i]/max(.1,weights[i])*envelope
        result.append(round(max(-.98,min(.98,value))*32767))
    with wave.open(str(out),'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(result.tobytes())

def combine(parts,output,work,name):
    # Match canlanin.mp3's production standard: 44.1kHz/stereo/320kbps,
    # mastered close to its -0.5dB true peak instead of a quieter TTS level.
    listing=work/f'{name}.txt'
    listing.write_text('\n'.join(f"file '{p}'" for p in parts))
    run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-af',
         'loudnorm=I=-14:TP=-1:LRA=9','-ar','44100','-ac','2','-codec:a','libmp3lame','-b:a','320k',str(output)])
    d=duration(output)
    if not .3<d<45:raise RuntimeError(f'Invalid output duration: {output.name}')
    log=run(['ffmpeg','-hide_banner','-i',str(output),'-af','volumedetect','-f','null','-']).stderr
    peak=re.search(r'max_volume: ([\-\w.]+) dB',log)
    if not peak or not math.isfinite(float(peak[1])) or float(peak[1]) < -40 or float(peak[1]) > -.5:
        raise RuntimeError(f'Invalid output levels: {output.name}')
    return d,float(peak[1])

def main():
    manifest=json.loads((SOUNDS/'dialogue-production.json').read_text())
    clips=manifest['clips']
    ORIGINALS.mkdir(exist_ok=True)
    for c in clips:
        source=SOUNDS/c['filename']
        if not source.exists():raise RuntimeError(f'Missing source: {source}')
        backup=ORIGINALS/source.name
        if not backup.exists():shutil.copy2(source,backup)
    results=[]
    with tempfile.TemporaryDirectory(prefix='kirbac-comic-') as folder:
        work=Path(folder)
        def silence(seconds,name):
            p=work/name
            run(['ffmpeg','-v','error','-y','-f','lavfi','-i','anullsrc=r=44100:cl=mono','-t',str(seconds),str(p)])
            return p
        short=silence(.085,'gap.wav');pause=silence(.45,'preview-gap.wav')
        ah_source=ORIGINALS/'ahhh_yandim_habibi.mp3'
        vowel=work/'sustained-a.wav'
        sustained_a(ah_source,vowel)
        ah=work/'ah.wav'
        # Resample before pitch processing; edit_piece operates on 44.1k sources.
        run(['ffmpeg','-v','error','-y','-i',str(vowel),'-ar','44100',str(ah)])
        combine([ah],work/'ahhh-preview.mp3',work,'ah-preview')
        preview=[]
        for i,c in enumerate(clips):
            source=ORIGINALS/c['filename'];ranges=spans(source);parts=[]
            filename=c['filename']
            if filename=='ahhh_elhamdulillah.mp3':
                source=ORIGINALS/'elhamdulillah.mp3';ranges=spans(source)
            elif filename=='ahhh_yandim_habibi.mp3':
                ranges=ranges[1:] # Discard the entire mispronounced interjection.
            elif filename=='ahhh_uhhh.mp3':
                # tr-TR-EmelNeural mispronounces the elongated 'uhhh' interjection as a
                # spoken word (Google STT hears it as "hey hey", i.e. giggling, not a
                # moan). Skip the TTS render for this word entirely and build the
                # middle groan from the same real vowel grains as the 'ahhh' bursts,
                # pitched down instead of up.
                ranges=[]
            if filename!='habibi_come_to_dubai.mp3':
                prefix=work/f'{i}-exclamation.wav'
                edit_piece(ah,0,.85,prefix,pitch=1.05+(i%3)*.05,tempo=.9+(i%2)*.1)
                parts += [prefix,short]
            for j,(start,end) in enumerate(ranges):
                target=work/f'{i}-{j}.wav'
                pitch=1.03+(i%3)*.035
                tempo=1.1+(j%2)*.05
                edit_piece(source,start,end,target,pitch,tempo)
                if parts and parts[-1]!=short:parts.append(short)
                parts.append(target)
            if filename=='ahhh_uhhh.mp3':
                moan=work/f'{i}-moan.wav'
                edit_piece(ah,0,.75,moan,pitch=.78,tempo=1.05)
                parts += [moan,short,ah]
            candidate=work/c['filename']
            d,peak=combine(parts,candidate,work,f'{i}-parts')
            results.append((candidate,c,d,peak))
            # Use decoded PCM for clean preview joins.
            wav=work/f'{i}-preview.wav'
            run(['ffmpeg','-v','error','-y','-i',str(candidate),str(wav)])
            preview += [wav,pause]
        combine(preview,work/'dialogue-preview.mp3',work,'all-clips')
        # A/B: original then new version of the first two reactions.
        comparison=[]
        for candidate,c,_,_ in results[:2]:
            original=work/f'original-{candidate.stem}.wav'
            edited=work/f'edited-{candidate.stem}.wav'
            run(['ffmpeg','-v','error','-y','-i',str(ORIGINALS/c['filename']),'-ar','44100','-ac','2',str(original)])
            run(['ffmpeg','-v','error','-y','-i',str(candidate),'-ar','44100','-ac','2',str(edited)])
            comparison += [original,pause,edited,pause]
        combine(comparison,work/'voice-comparison.mp3',work,'comparison')
        for candidate,c,d,peak in results:
            shutil.copy2(candidate,SOUNDS/c['filename'])
            c.update(status='edited_requires_listening_review',duration=round(d,3),peak_db=peak,
                     original_sha256=hashlib.sha256((ORIGINALS/c['filename']).read_bytes()).hexdigest())
            print(f"{c['filename']}: {d:.2f}s, peak {peak:.1f}dB")
        for filename in ['dialogue-preview.mp3','voice-comparison.mp3','ahhh-preview.mp3']:
            shutil.copy2(work/filename,SOUNDS/filename)
    manifest['format'].update(bitrate_kbps=320,channels=2)
    manifest.update(status='edited_requires_listening_review',
      postprocessing='Removed mispronounced ah interjections. Sustained only the open /a/ nucleus from yandım using pitch-synchronous overlap-add; no ey transition (scream-contour pitch spike, not a flat drone). '
        'Trembling, pained delivery on every clip: tremolo+vibrato, soft-clip rasp and harmonic exciter, plus wider per-clip pitch/tempo variation. '
        'Mastered to canlanin.mp3\'s production standard (44.1kHz/stereo/320kbps, ~-17dB integrated loudness, -1dB true peak) instead of the thinner mono/192kbps TTS output. '
        'Offline edit, not newly acted speech.',
      original_directory='original-dialogues')
    (SOUNDS/'dialogue-production.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
