"""Render gentle character foley and reformat original UI/prop recordings."""
import argparse
from pathlib import Path
import struct
import subprocess

import numpy as np
from scipy.signal import butter, sosfilt, resample

RATE = 48000
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/audio'


def run(*args, data=None, capture=False):
    return subprocess.run(['ffmpeg', '-v', 'error', '-y', *map(str, args)], input=data,
                          stdout=subprocess.PIPE if capture else None, check=True).stdout


def sampled_rustle():
    source = '/usr/share/sounds/freedesktop/stereo/trash-empty.oga'
    return np.frombuffer(run('-i', source, '-ac', 1, '-ar', RATE, '-f', 'f32le', '-',
                             capture=True), dtype='<f4')


def instrument(name):
    bank = Path('/usr/share/sounds/sf2/TimGM6mb.sf2').read_bytes()
    samples = bank.index(b'smpl') + 8
    hdr = bank.index(b'shdr') + 8
    n = struct.unpack_from('<I', bank, hdr - 4)[0]
    for pos in range(hdr, hdr+n, 46):
        key, start, end, _, _, hz, *_ = struct.unpack_from('<20sIIIIIBbHH', bank, pos)
        if key.strip(b'\0').decode() == name:
            wave = np.frombuffer(bank, '<i2', end - start, samples + start*2).astype(float)/32768
            return resample(wave, round(len(wave)*RATE/hz))
    raise ValueError(name)


def piece(data, start, seconds, speed, high, low):
    start = int(start*RATE)
    a = data[start:start + round(seconds*speed*RATE)]
    a = resample(a, round(len(a)/speed))
    a = sosfilt(butter(3, [high, low], fs=RATE, btype='bandpass', output='sos'), a)
    a *= np.minimum(np.arange(len(a))/130, 1)*np.minimum(np.arange(len(a))[::-1]/500, 1)
    return a/max(1e-6, np.max(np.abs(a)))


def mix(events):
    n = max(round(t*RATE)+len(w) for t,w,v in events)
    a = np.zeros(n)
    for t, w, v in events:
        i = round(t*RATE)
        a[i:i+len(w)] += w*v
    return a*min(1, .58/max(np.max(np.abs(a)), .001))


def main(masters):
    masters.mkdir(parents=True, exist_ok=True)
    rustle, wood, cup = sampled_rustle(), instrument('Rosewood Claves'), instrument('TubeBell')
    def r(at, sec, speed, high, low):
        return piece(rustle, at, sec, speed, high, low)
    def tap(speed, low):
        return piece(wood, 0, .09, speed, 180, low)
    # Contact sounds follow gesture timing: leaf over paper, two bites, brush strokes,
    # a cup tapping its saucer, and the soft rustle of handing over a wrapped snack.
    gestures = {
        'read': [(0,r(.12,.37,.83,420,4100),.32),(.27,r(.55,.48,.82,550,4500),.39)],
        'eat': [(0,r(.26,.11,.85,510,3100),.51),(.15,r(.42,.16,.96,380,3600),.28),
                (.39,r(.36,.17,.76,330,2900),.42),(.63,r(.54,.15,1.02,630,3900),.21)],
        'diary': [(0,r(.56,.20,.68,750,4060),.22),(.22,r(.32,.13,.74,750,3500),.23),
                  (.41,r(.62,.34,.67,620,3450),.29),(.81,tap(.86,2100),.10)],
        'tea': [(0,r(.56,.23,.59,230,1450),.22),(.38,tap(.77,2600),.29),
                (.39,piece(cup,0,.52,1.72,820,3360)*np.exp(-np.arange(round(.52*RATE))/(RATE*.12)),.21)],
        'feed': [(0,r(.15,.25,.87,450,3400),.27),(.24,tap(.86,3100),.28),
                 (.38,r(.44,.18,.84,510,3980),.24),(.60,r(.58,.14,.91,490,3400),.20)]
    }
    for name, events in gestures.items():
        a = mix(events)
        wav = masters/f'fx-{name}.wav'
        run('-f','f32le','-ar',RATE,'-ac',1,'-i','-','-c:a','pcm_s24le',wav,data=a.astype('<f4').tobytes())
        run('-i',wav,'-ar',44100,'-ac',1,'-c:a','libmp3lame','-b:a','192k',OUT/f'fx-{name}.mp3')

    # The original compressed recordings are archived verbatim in source-audio.
    for original in sorted((ROOT/'source-audio/legacy-effects').glob('*.mp3')):
        key = original.stem
        if key in ('ui01','ui02','ui03','ui06'):
            run('-i',original,'-ac',1,'-ar',44100,'-c:a','pcm_s16le',OUT/(key+'.wav'))
            (OUT/original.name).unlink(missing_ok=True)
        else:
            bitrate = {'prop03':'40k','ui07':'160k'}.get(key, '192k')
            attenuation = 'volume=-3dB' if key=='prop03' else 'volume=1'
            run('-i',original,'-af',attenuation,'-ar',44100,'-ac',1,'-c:a','libmp3lame','-b:a',bitrate,OUT/original.name)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('masters', type=Path)
    main(parser.parse_args().masters)
