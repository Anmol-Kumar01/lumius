"""Generate an original, low-volume ambient chord for the Lumius music demo."""
import math
from pathlib import Path
import struct
import sys
import wave

destination = Path(sys.argv[1])
destination.parent.mkdir(parents=True, exist_ok=True)
rate, seconds = 22050, 12
with wave.open(str(destination), 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(rate)
    frames = bytearray()
    for i in range(rate * seconds):
        t = i / rate
        envelope = min(1, t / 2, (seconds - t) / 3)
        sample = sum(math.sin(2 * math.pi * f * t) for f in (220, 277.18, 329.63)) / 3
        frames += struct.pack('<h', int(sample * envelope * 4500))
    audio.writeframes(frames)
