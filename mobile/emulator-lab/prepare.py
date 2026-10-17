"""Legacy optional Python entrypoint: delegate to the single verified Node preparer.
Python is not required; prefer: node mobile/emulator-lab/prepare.cjs
"""
from pathlib import Path
import subprocess,sys
if __name__ == '__main__':
    if len(sys.argv) != 1:
        raise SystemExit('No download overrides accepted')
    raise SystemExit(subprocess.call(['node', str(Path(__file__).with_suffix('.cjs'))]))
