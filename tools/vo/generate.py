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
    'isr': ('am_puck', 'en-us', 1.08),  # American dispatch: steady and quick
}
# The radio, modelled on digital (P25-style) scanner audio rather than hiss: the voice is
# levelled, squeezed into the narrow voice band and pushed through Codec2 at 3200 bit/s (an
# open digital-radio vocoder), which gives the warbly, compressed character of a trunked
# radio net. Then a final band-limit, a touch of presence and level. Squelch clicks, tails
# and a light static bed are added in the game.
CHAIN = 'codec2-3200-v1'
PRE = 'highpass=f=250,lowpass=f=3600,acompressor=threshold=-22dB:ratio=4:attack=5:release=100:makeup=4'
POST = ('highpass=f=300,lowpass=f=3000,equalizer=f=1500:t=q:w=1:g=3,'
        'acompressor=threshold=-18dB:ratio=3:makeup=3,volume=1.2')

def radio(src_wav, dst_mp3):
    with tempfile.TemporaryDirectory() as d:
        c2 = os.path.join(d, 'v.c2')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src_wav, '-af', PRE, '-ar', '8000', '-ac', '1', '-c:a', 'libcodec2', '-mode', '3200', c2], check=True)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', c2, '-af', POST, '-ar', '22050', '-ac', '1', '-b:a', '40k', dst_mp3], check=True)

def norm(t):
    t = t.lower().replace('’', "'").replace('…', '...')
    t = re.sub(r"[^a-z0-9 ]+", ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def main(model, voices, cache=None):
    k = Kokoro(model, voices)
    cache = cache or os.path.join(os.path.dirname(__file__), '.cache')  # clean renders (not committed)
    os.makedirs(cache, exist_ok=True)
    manifest = {}
    path = os.path.join(OUT, 'manifest.json')
    if os.path.exists(path): manifest = json.load(open(path))
    # A different radio chain re-processes every clip (from the cached clean renders).
    redo = manifest.get('_chain') != CHAIN
    manifest = {'_chain': CHAIN} if redo else manifest
    jobs = [(w, t) for t in OP for w in ('shooter', 'spotter')] + [('isr', t) for t in ISR]
    for i, (who, text) in enumerate(jobs):
        key = norm(text)
        fid = hashlib.sha1(key.encode()).hexdigest()[:10]
        rel = f'{who}/{fid}.mp3'
        dst = os.path.join(OUT, rel)
        manifest.setdefault(who, {})[key] = rel
        if os.path.exists(dst) and not redo: continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        clean = os.path.join(cache, f'{who}_{fid}.wav')
        if os.path.exists(clean):
            radio(clean, dst)
            continue
        voice, lang, speed = CAST[who]
        # Long lines go sentence by sentence (the model caps its input), joined with short gaps.
        parts = re.split(r'(?<=[.!?])\s+', text) if len(text) > 180 else [text]
        audio = []
        for p in parts:
            a, sr = k.create(p, voice=voice, speed=speed, lang=lang)
            audio += [a, np.zeros(int(sr * 0.12), dtype=a.dtype)]
        sf.write(clean, np.concatenate(audio), sr)
        radio(clean, dst)
        if i % 20 == 0:
            print(f'{i + 1}/{len(jobs)} {who}: {text[:60]}', flush=True)
            json.dump(manifest, open(path, 'w'), indent=0, sort_keys=True)
    json.dump(manifest, open(path, 'w'), indent=0, sort_keys=True)
    print('done', len(jobs), 'lines')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
