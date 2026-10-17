"""Fetch only the official Firestore emulator artifact; validate SHA-256 and size."""
from pathlib import Path
import hashlib,json,urllib.request
ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'.tools/emulator-lab/cache'
def prepare():
 info=json.loads((ROOT/'node_modules/firebase-tools/lib/emulator/downloadableEmulatorInfo.json').read_text())['firestore']
 assert info['version']=='1.22.0' and info['expectedChecksumSHA256']=='9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c'
 assert info['remoteUrl']=='https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar'
 CACHE.mkdir(parents=True,exist_ok=True);target=CACHE/info['downloadPathRelativeToCacheDir'];temp=target.with_suffix('.download')
 def valid(p):return p.exists() and p.stat().st_size==info['expectedSize'] and hashlib.sha256(p.read_bytes()).hexdigest()==info['expectedChecksumSHA256']
 if not valid(target):
  with urllib.request.urlopen(info['remoteUrl'],timeout=60) as r,temp.open('wb') as f:
   while chunk:=r.read(1024*1024):f.write(chunk)
  if not valid(temp):raise RuntimeError('Emulator checksum/size mismatch; not installed')
  temp.replace(target)
 print('Firestore emulator 1.22.0: official SHA-256 verified')
if __name__=='__main__':prepare()
