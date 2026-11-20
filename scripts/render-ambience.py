"""Render six loopable location beds. Requires numpy, scipy, ffmpeg and the freedesktop sound theme."""
import argparse
from pathlib import Path
import subprocess

import numpy as np
from scipy import signal

RATE = 48000
ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "dist/audio"
RUSTLE = Path("/usr/share/sounds/freedesktop/stereo/trash-empty.oga")
PI2 = 2 * np.pi


def time(seconds):
    return np.arange(round(seconds * RATE)) / RATE


def band(samples, low, high):
    sos = signal.butter(3, [low, high], btype="bandpass", fs=RATE, output="sos")
    return signal.sosfilt(sos, samples)


class Bed:
    def __init__(self, length, seed):
        self.seconds = length
        self.rng = np.random.default_rng(seed)
        self.mix = np.zeros(length * RATE)
        self.t = time(length)
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(RUSTLE), "-ar", str(RATE),
                                       "-ac", "1", "-f", "f32le", "-"])
        self.rustle = np.frombuffer(raw, dtype="<f4")

    def add(self, at, samples):
        # Wrap tails, including the last water drop or tick, through the loop point.
        i = round(at * RATE) % len(self.mix)
        n = min(len(samples), len(self.mix) - i)
        self.mix[i:i+n] += samples[:n]
        self.mix[:len(samples)-n] += samples[n:]

    def air(self, low, high, amp, periods=4):
        # Filter one circular period with context to avoid a state discontinuity.
        white = self.rng.normal(size=len(self.t))
        noise = band(np.r_[white[-4096:], white], low, high)[4096:]
        phase = self.t / self.seconds * PI2
        envelope = .6 + .19*np.sin(phase*periods) + .15*np.sin(phase*(periods+3)+.7)
        self.mix += amp * envelope * noise / np.std(noise)

    def leaves(self, count, strength, low=350, high=4200):
        for at in self.rng.uniform(0,self.seconds,count):
            n = self.rng.integers(RATE//6, RATE*3//4)
            start = self.rng.integers(0, len(self.rustle)-n)
            grain = band(self.rustle[start:start+n], low, high) * np.hanning(n)
            self.add(at, grain * strength / max(.15, np.max(np.abs(grain))))

    def plip(self, at, pitch, gain, decay=.045):
        t = time(decay * 5)
        phase = PI2*pitch*(t + .38*decay*(1-np.exp(-t/decay)))
        drop = (np.sin(phase)+.18*np.sin(phase*2.7))*np.exp(-t/decay)*(-np.expm1(-t/.002))
        self.add(at,gain*drop)

    def knock(self, at, pitch, gain, decay):
        t=time(decay*7)
        tone = sum(vol*np.sin(PI2*pitch*ratio*t)*np.exp(-t/(decay/ratio**.5))
                   for ratio,vol in [(1,1),(2.1,.42),(3.7,.2)])
        hit=band(self.rng.normal(size=len(t)),420,4800)*np.exp(-t/.003)
        self.add(at,gain*(tone+.55*hit)*(-np.expm1(-t/.0009)))

    def chirp(self, at, start, end, duration, gain, tremolo=0):
        t=time(duration)
        phase=PI2*(start*t+.5*(end-start)*t*t/duration)
        env=np.sin(np.pi*t/duration)**2
        if tremolo: env *= (.5+.5*np.sin(PI2*t*tremolo))**2
        self.add(at,gain*env*(np.sin(phase)+.19*np.sin(2*phase)))

    def day(self):
        self.air(180,2400,.075)
        self.air(750,4300,.035,7)
        self.leaves(32,.09)
        for at in self.rng.uniform(0,self.seconds,1050):
            self.plip(at,self.rng.uniform(460,1800),self.rng.uniform(.009,.055),self.rng.uniform(.011,.032))
        for at in (9.8,28.3,49.5):
            self.chirp(at,1660,1490,.22,.11)
            self.chirp(at+.28,1450,1040,.31,.09)
        for at in (17.5,42.1):
            self.knock(at,330,.15,.033)
            self.plip(at+.17,890,.14,.045)

    def night(self):
        self.air(140,1700,.065)
        self.leaves(19,.065,260,2850)
        for at in np.arange(.2,self.seconds,1.23):
            for j in range(self.rng.integers(2,5)):
                self.chirp(at+j*.09,2630,2540,.062,.022,43)
        for at in (14.1,44.8):
            for j in range(2):
                t=time(.27)
                phase=PI2*(135*t+30*t*t)
                croak=(np.sin(phase*3)+.7*np.sin(phase*4)+.5*np.sin(phase*5))
                self.add(at+j*.34,.064*croak*np.sin(np.pi*t/.27)**2*(.4+.6*np.sin(PI2*26*t)**2))

    def rain(self):
        self.air(340,4400,.095)
        self.air(70,820,.045,3)
        self.leaves(85,.045,650,3900)
        for at in self.rng.uniform(0,self.seconds,3000):
            self.knock(at,self.rng.uniform(700,2600),self.rng.uniform(.013,.085),self.rng.uniform(.003,.012))
        for at in np.arange(1,self.seconds,2.8):
            self.plip(at+self.rng.uniform(-.3,.3),self.rng.uniform(570,990),.19,.07)

    def snow(self):
        self.air(70,680,.10,3)
        self.air(390,1950,.034,6)
        self.leaves(26,.085,100,1500)
        for at in (12.1,29.9,39.2): self.knock(at,235,.08,.031)

    def fire(self):
        self.air(65,410,.085)
        self.leaves(35,.045,130,1800)
        for at in self.rng.uniform(0,self.seconds,275):
            self.knock(at,self.rng.uniform(280,1620),self.rng.uniform(.026,.23),self.rng.uniform(.003,.012))

    def clock(self):
        self.air(85,680,.052,3)
        self.leaves(9,.028,160,1000)
        for i in range(self.seconds):
            self.knock(i+.27,680 if i%2 else 815,.145 if i%2 else .18,.012)

    def save(self, key, masters, level):
        # Master a complete cycle at a restrained level. Enforce a zero crossing in
        # a one-millisecond window; all longer event/reverb tails already wrap.
        rms=np.sqrt(np.mean(self.mix**2))
        wave=self.mix*min(level/rms,.78/max(np.abs(self.mix)))
        edge=np.sin(np.linspace(0,np.pi/2,48))**2
        wave[:48]*=edge
        wave[-48:]*=edge[::-1]
        wav=masters/(key+".wav")
        subprocess.run(["ffmpeg","-loglevel","error","-y","-f","f32le","-ar",str(RATE),"-ac","1",
                        "-i","-","-c:a","pcm_s24le",str(wav)],input=wave.astype("<f4").tobytes(),check=True)
        subprocess.run(["ffmpeg","-loglevel","error","-y","-i",str(wav),"-c:a","libmp3lame",
                        "-ar","44100","-ac","1","-b:a","96k","-write_xing","1",str(AUDIO/(key+".mp3"))],check=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("master_directory",type=Path)
    args=parser.parse_args()
    args.master_directory.mkdir(parents=True,exist_ok=True)
    tracks=[("amb01","day",60,.095),("amb02","night",60,.078),("amb03","rain",45,.09),
            ("amb04","snow",45,.078),("amb04-fire","fire",45,.074),("amb05","clock",30,.052)]
    for i,(key,style,seconds,level) in enumerate(tracks):
        bed=Bed(seconds,911+i)
        getattr(bed,style)()
        bed.save(key,args.master_directory,level)
        print(key,seconds,flush=True)
