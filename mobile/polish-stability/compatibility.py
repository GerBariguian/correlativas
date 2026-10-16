"""Reuse the approved 2.4.1 responsive suites against 2.4.2, preserving assertions."""
from pathlib import Path
import subprocess,sys,argparse
ROOT=Path(__file__).resolve().parents[2]
def run(name):
 path=ROOT/'mobile/responsive-parity'/f'{name}.check.py';source=path.read_text()
 if name=='visual':
  # Compare the approved, unchanged 2.4.2 artifact to the gesture correction.
  source=source.replace('mobile-241/dist','mobile-243-polish-stability/dist').replace('mobile-240-reproduction/dist','mobile-242-hold150/dist')
 source=source.replace("'mobile-241/dist'","'mobile-243-polish-stability/dist'") if name!='visual' else source
 source=source.replace('mobile/responsive-parity/vite.config.mjs','mobile/polish-stability/vite.config.mjs')
 for old in ['mobile-241-checks','mobile-241-interaction','mobile-241-visual']:
  source=source.replace(old,old.replace('241','243-polish-stability'))
 wrapper='exec(compile('+repr(source)+','+repr(str(path))+',"exec"),{"__file__":'+repr(str(path))+',"__name__":"__main__"})'
 subprocess.run([sys.executable,'-c',wrapper],cwd=ROOT,check=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--suite',choices=['parity','interaction','visual','all'],default='all');args=parser.parse_args()
 for name in ['parity','interaction','visual'] if args.suite=='all' else [args.suite]:run(name)
