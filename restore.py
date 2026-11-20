"""Run with Python 3 to restore the original game ZIP from this snapshot."""
import hashlib
from pathlib import Path

root = Path(__file__).resolve().parent
target = root / 'travel-panda-source-5ee0d32.zip'
temporary = target.with_suffix('.zip.partial')
checksum = hashlib.sha256()
with temporary.open('wb') as output:
    for index in range(160):
        data = (root / 'parts' / f'part-{index:03d}').read_bytes()
        output.write(data)
        checksum.update(data)
if checksum.hexdigest() != '345612d05caed1740e4e7427e6873afd4a1aeda0888b86f427c5e6550c196873':
    raise SystemExit('Archive checksum mismatch')
temporary.replace(target)
print(target)
