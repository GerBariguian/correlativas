"""Export declared files only, with no .git, .env, installed dependencies or caches."""
from pathlib import Path
import argparse, json, shutil
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
HELPERS=['rebuild.py','export_clean.py','regression.py','inputs.lock.json','toolchain.json','requirements-tests.txt','README.md','files-to-version.txt']
def export(target):
    if target.exists(): raise RuntimeError('Choose a destination that does not exist')
    target.mkdir(parents=True)
    manifest=json.loads((HERE/'inputs.lock.json').read_text())
    names=set(manifest['inputs'])|{manifest['approvedZip'],manifest['approvedZip']+'.sha256'}
    names|={'mobile/reproducible-base/'+name for name in HELPERS}
    for name in sorted(names):
        source=ROOT/name
        if source.is_symlink() or not source.is_file():raise RuntimeError(f'Missing or linked input: {name}')
        dest=target/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
    print(json.dumps({'destination':str(target),'files':len(names),'gitMetadata':False,'installedDependenciesCopied':False},indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('destination',type=Path)
    export(parser.parse_args().destination.resolve())
