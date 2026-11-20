"""Render the six original game scores using the bundled/licensed TimGM instruments.

Usage: python scripts/render-scene-music.py /path/to/wav-masters
Requires ffmpeg, NumPy, libfluidsynth and /usr/share/sounds/sf2/TimGM6mb.sf2.
"""
import argparse
import ctypes as C
from ctypes.util import find_library
from pathlib import Path
import random
import subprocess
import wave

import numpy as np

RATE = 48000
ROOT = Path(__file__).resolve().parents[1]
PRESETS = [
    # title, seconds, bpm, tonic, mode, GM answering voices, accompaniment, bass
    ('竹林晨曦·日出', 90, 72, 55, 'major', (107, 77), 24, 45),
    ('空庭守望·远行', 80, 64, 52, 'minor', (0, 11), 14, 0),
    ('灯火竹屋·夜阑', 100, 58, 48, 'major', (75, 107), 46, 45),
    ('远方来信·归家', 45, 80, 50, 'major', (73, 10), 24, 115),
    ('春风踏青·节令', 75, 78, 53, 'major', (105, 77), 107, 24),
    ('围炉煮雪·节令', 85, 62, 45, 'major', (110, 75), 24, 42),
]
# (onset in beats, pentatonic degree, length in beats) for call and response.
PHRASES = [
    [[(0,2,.8),(1,3,.55),(2,4,1.2),(4,5,1.5),(6,4,.7)],[(0,3,1.4),(2,2,1),(4,1,.7),(5,2,.8),(6,0,1.3)]],
    [[(.5,2,2),(3.75,1,1.5),(6,0,1)],[(1,3,1.3),(4,2,1),(6,1,1.6)]],
    [[(0,2,2.1),(3,1,1.5),(5.5,0,1.8)],[(0,1,1.3),(2,2,2.2),(5,4,.9),(6.5,2,1)]],
    [[(0,0,.65),(1,1,.65),(2,2,1.4),(4,4,1.1),(5.5,5,1.8)],[(0,4,.9),(1.5,3,.9),(3,2,.7),(4,1,.8),(6,0,1.7)]],
    [[(0,2,.55),(.75,3,.5),(1.5,4,.8),(3,3,.6),(4,5,1.1),(6,4,.8)],[(.5,3,.7),(2,2,1.3),(4,1,.5),(5,3,.7),(6.5,2,.8)]],
    [[(.5,0,1.6),(3,2,1.4),(5.5,3,1.8)],[(0,4,1.7),(3,3,1.1),(5,2,.75),(6.5,0,1.3)]],
]
CHORDS = [(0,2,4),(3,5,7),(1,3,5),(4,6,8),(0,2,4),(2,4,6),(4,6,8),(0,2,4)]

class SampleSynth:
    def __init__(self, soundfont):
        self.lib = C.CDLL(find_library('fluidsynth'))
        pointer, integer = C.c_void_p, C.c_int
        for name, restype, args in [
            ('new_fluid_settings', pointer, []),
            ('fluid_settings_setnum', integer, [pointer, C.c_char_p, C.c_double]),
            ('fluid_settings_setint', integer, [pointer, C.c_char_p, integer]),
            ('new_fluid_synth', pointer, [pointer]),
            ('fluid_synth_sfload', integer, [pointer, C.c_char_p, integer]),
            ('fluid_synth_program_change', integer, [pointer, integer, integer]),
            ('fluid_synth_cc', integer, [pointer, integer, integer, integer]),
            ('fluid_synth_noteon', integer, [pointer, integer, integer, integer]),
            ('fluid_synth_noteoff', integer, [pointer, integer, integer]),
            ('fluid_synth_write_float', integer, [pointer, integer, pointer, integer, integer, pointer, integer, integer]),
            ('delete_fluid_synth', None, [pointer]), ('delete_fluid_settings', None, [pointer]),
        ]:
            fn = getattr(self.lib, name)
            fn.argtypes, fn.restype = args, restype
        self.settings = self.lib.new_fluid_settings()
        self.lib.fluid_settings_setnum(self.settings, b'synth.sample-rate', RATE)
        self.lib.fluid_settings_setnum(self.settings, b'synth.gain', .42)
        self.lib.fluid_settings_setint(self.settings, b'synth.chorus.active', 0)
        self.handle = self.lib.new_fluid_synth(self.settings)
        if self.lib.fluid_synth_sfload(self.handle, str(soundfont).encode(), 1) < 0:
            raise ValueError('Failed to load soundfont')

    def release(self):
        self.lib.delete_fluid_synth(self.handle)
        self.lib.delete_fluid_settings(self.settings)

    def render(self, programs, events, seconds):
        for channel, program in enumerate(programs):
            self.lib.fluid_synth_program_change(self.handle, channel, program)
            self.lib.fluid_synth_cc(self.handle, channel, 10, [52,75,43,64,80][channel])
            self.lib.fluid_synth_cc(self.handle, channel, 91, [36,42,25,20,50][channel])
        output = np.zeros(((seconds + 4)*RATE, 2), dtype='float32')
        pos = 0
        for t, velocity, channel, key in sorted(events+[(len(output),0,0,0)]):
            if t > pos:
                ptr = output[pos:].ctypes.data
                self.lib.fluid_synth_write_float(self.handle,t-pos,ptr,0,2,ptr,1,2)
                pos = t
            if velocity:
                self.lib.fluid_synth_noteon(self.handle, channel, key, velocity)
            else:
                self.lib.fluid_synth_noteoff(self.handle, channel, key)
        # Keep the last phrase's reverberation across the loop boundary.
        end = seconds*RATE
        output[:4*RATE] += output[end:]*np.linspace(1,0,4*RATE,dtype='float32')[:,None]
        return output[:end]

def compose(track):
    title, seconds, bpm, tonic, mode, leads, arp, bass = PRESETS[track]
    rng = random.Random(12000 + track)
    beat = 60/bpm
    scale = [0,3,5,7,10] if mode=='minor' else [0,2,4,7,9]
    def pitch(degree):
        return tonic + 12*(degree//5) + scale[degree%5]
    events = []
    def note(channel, start, key, length, velocity):
        t = start*beat
        if t < 0 or t >= seconds-.7: return
        finish = min(seconds-.25,t+length*beat)
        events.extend([(round(t*RATE), velocity, channel, key),(round(finish*RATE),0,channel,key)])
    beats = seconds/beat
    for bar in range(int(beats//4)):
        when = 4*bar
        if when+3 >= beats-3: break
        triad = CHORDS[bar%8]
        if track==1: # The empty courtyard has sparse piano punctuation and bowl overtones.
            if bar%2==0: note(3,when,pitch(triad[0])-12,2.3,43)
            if bar%3!=1: note(2,when+2.45,pitch(triad[2]),1.2,42)
        else:
            steps = {0:[0,1,1.5,3],2:[0,2.5],3:[0,1.5,2.5],4:[0,.75,1.5,2.5,3],5:[0,1.75,3]}[track]
            for i, offset in enumerate(steps):
                note(2,when+offset+rng.uniform(.01,.045),pitch(triad[(i+bar%2)%3]),.8,rng.randint(38,53))
            note(3,when,pitch(triad[0])-12,2.6 if track==5 else 1.7,45 if track==5 else 40)
        if bar%2==0:
            phrase = bar//2
            channel = phrase%2
            for offset, degree, duration in PHRASES[track][channel]:
                if when+offset > beats-4: continue
                variation = 1 if (phrase%4==2 and degree>=2) else 0
                note(channel, when+offset+.06, pitch(degree+variation)+12,duration,rng.randint(48,61))
        if track==3 and bar in (0,4,10):
            for i, degree in enumerate([2,4,5]):
                note(4,when+i*.25,pitch(degree)+24,.55,38+i*3)
    note(0,beats-3,pitch(0)+12,1.9,50)
    note(2,beats-3.05,pitch(2),1.1,38)
    note(3,beats-3.1,pitch(0)-12,1.65,38)
    return [*leads,arp,bass,10], events

def write_master(path, data):
    # Soft peak protection and headroom for separate weather/SFX buses.
    rms = np.sqrt(np.mean(data**2))
    data = np.tanh(data*min(.13/max(.001,rms),.78/max(.001,np.max(np.abs(data)))))
    fade = np.linspace(0,1,180,dtype='float32')[:,None]
    data[:len(fade)] *= fade
    data[-len(fade):] *= fade[::-1]
    words = (data*8388607).round().astype('<i4')
    packed = words.view('uint8').reshape(-1,4)[:,:3].tobytes()
    with wave.open(str(path),'wb') as w:
        w.setparams((2,3,RATE,0,'NONE','not compressed'))
        w.writeframes(packed)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('masters',type=Path)
    parser.add_argument('--soundfont',type=Path,default=Path('/usr/share/sounds/sf2/TimGM6mb.sf2'))
    args = parser.parse_args()
    args.masters.mkdir(parents=True,exist_ok=True)
    for i,(title,seconds,*_) in enumerate(PRESETS):
        name=f'bgm{i+1:02d}'
        synth=SampleSynth(args.soundfont)
        try: data=synth.render(*compose(i),seconds)
        finally: synth.release()
        master=args.masters/(name+'.wav')
        write_master(master,data)
        bitrate='128k' if seconds<=60 else '96k'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(master),'-ar','44100',
                        '-c:a','libmp3lame','-b:a',bitrate,'-metadata','title='+title,
                        str(ROOT/'dist/audio'/(name+'.mp3'))],check=True)
        print(name,title,flush=True)

if __name__=='__main__': main()
