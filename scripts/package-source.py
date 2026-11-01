"""Package tracked Lumius source, excluding build outputs and private VM state."""
import hashlib
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
files = subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().strip('\0').split('\0')
if not files or files == ['']:
    raise SystemExit('Stage source files in Git first.')
out = root / 'artifacts' / 'lumius-0.1.0-source.zip'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root/name,'lumius-source/'+name)
digest = hashlib.sha256(out.read_bytes()).hexdigest()
out.with_suffix('.zip.sha256').write_text(digest+'  '+out.name+'\n')
print(out)
