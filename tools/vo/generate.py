# Render every radio line with Kokoro (Apache-2.0, https://github.com/thewh1teagle/kokoro-onnx),
# give it a tactical-radio treatment with ffmpeg, and write audio/vo/<speaker>/<id>.mp3 plus
# audio/vo/manifest.json (normalised text -> file). Needs: pip install kokoro-onnx soundfile,
# ffmpeg, and the model files (kokoro-v1.0.int8.onnx, voices-v1.0.bin) passed as arguments.
import hashlib, json, os, re, subprocess, sys, tempfile
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
sys.path.insert(0, os.path.dirname(__file__))
from lines import OP, ISR

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'audio', 'vo')
CAST = {  # speaker -> (voice, lang, speed)
    'shooter': ('am_fenrir', 'en-us', 1.08),
    'spotter': ('am_michael', 'en-us', 1.1),
    'isr': ('bm_george', 'en-gb', 1.04),
}
# The radio: narrow band, a presence bump, hard compression, a little grit.
RADIO = ('highpass=f=320,lowpass=f=3300,equalizer=f=1700:t=q:w=1.1:g=7,'
         'acompressor=threshold=-24dB:ratio=8:attack=3:release=80:makeup=6,'
         'asoftclip=type=tanh:threshold=0.7,highpass=f=300,lowpass=f=3400,volume=0.9')

def norm(t):
    t = t.lower().replace('’', "'").replace('…', '...')
    t = re.sub(r"[^a-z0-9 ]+", ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def main(model, voices):
    k = Kokoro(model, voices)
    manifest = {}
    path = os.path.join(OUT, 'manifest.json')
    if os.path.exists(path): manifest = json.load(open(path))
    jobs = [(w, t) for t in OP for w in ('shooter', 'spotter')] + [('isr', t) for t in ISR]
    for i, (who, text) in enumerate(jobs):
        key = norm(text)
        fid = hashlib.sha1(key.encode()).hexdigest()[:10]
        rel = f'{who}/{fid}.mp3'
        dst = os.path.join(OUT, rel)
        manifest.setdefault(who, {})[key] = rel
        if os.path.exists(dst): continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        voice, lang, speed = CAST[who]
        # Long lines go sentence by sentence (the model caps its input), joined with short gaps.
        parts = re.split(r'(?<=[.!?])\s+', text) if len(text) > 180 else [text]
        audio = []
        for p in parts:
            a, sr = k.create(p, voice=voice, speed=speed, lang=lang)
            audio += [a, np.zeros(int(sr * 0.12), dtype=a.dtype)]
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            sf.write(tmp.name, np.concatenate(audio), sr)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp.name, '-af', RADIO, '-ac', '1', '-ar', '22050', '-b:a', '40k', dst], check=True)
            os.unlink(tmp.name)
        if i % 20 == 0:
            print(f'{i + 1}/{len(jobs)} {who}: {text[:60]}', flush=True)
            json.dump(manifest, open(path, 'w'), indent=0, sort_keys=True)
    json.dump(manifest, open(path, 'w'), indent=0, sort_keys=True)
    print('done', len(jobs), 'lines')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
