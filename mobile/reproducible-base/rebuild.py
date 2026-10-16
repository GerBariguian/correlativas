"""Rebuild only the approved static demo; never deploy or write approved downloads."""
from pathlib import Path
import argparse, hashlib, json, platform, re, subprocess, sys, zipfile, zlib
ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUTPUT = ROOT / '.tools/mobile-240-reproduction'
def digest(data): return hashlib.sha256(data).hexdigest()
def read_json(path): return json.loads(path.read_text())
def verify_inputs(manifest):
    for name, expected in manifest['inputs'].items():
        path = ROOT / name
        if not path.is_file() or path.is_symlink() or digest(path.read_bytes()) != expected:
            raise RuntimeError(f'Input missing or changed: {name}')
    reference = ROOT / manifest['approvedZip']
    if digest(reference.read_bytes()) != manifest['approvedSHA256']:
        raise RuntimeError('Approved ZIP checksum mismatch')
    with zipfile.ZipFile(reference) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(manifest['approvedFiles']):
            raise RuntimeError('Approved ZIP has unexpected contents')
        for name, expected in manifest['approvedFiles'].items():
            if digest(archive.read(name)) != expected: raise RuntimeError(f'Approved member changed: {name}')
def versions():
    return {'node': subprocess.check_output(['node','--version'],text=True).strip(),
            'npm': subprocess.check_output(['npm','--version'],text=True).strip(),
            'python': platform.python_version(), 'zlib': zlib.ZLIB_RUNTIME_VERSION,
            'system': platform.system(), 'machine': platform.machine()}
def run(verify_only=False):
    manifest = read_json(HERE / 'inputs.lock.json')
    verify_inputs(manifest)
    actual = versions(); required = read_json(HERE / 'toolchain.json')['build']
    if actual != required:
        raise RuntimeError(f'Toolchain differs. Expected {required}; actual {actual}. Do not change approved hashes.')
    if verify_only:
        print(json.dumps({'inputsVerified':len(manifest['inputs']),'approvedZipVerified':True,'toolchain':actual},indent=2)); return
    if OUTPUT.is_symlink(): raise RuntimeError('Output must not be a symlink')
    OUTPUT.mkdir(parents=True,exist_ok=True)
    dist = OUTPUT / 'dist'
    if dist.is_symlink(): raise RuntimeError('Dist must not be a symlink')
    subprocess.run(['node','node_modules/vite/bin/vite.js','build','--config',
        'mobile/integration-final/vite.config.mjs','--outDir','../../.tools/mobile-240-reproduction/dist'],cwd=ROOT,check=True)
    paths = {p.relative_to(dist).as_posix():p for p in dist.rglob('*') if p.is_file()}
    expected = manifest['approvedFiles']
    if set(paths) != set(expected)-{'SHA256SUMS'}: raise RuntimeError('Unexpected build files')
    for name,path in paths.items():
        if path.is_symlink() or digest(path.read_bytes()) != expected[name]: raise RuntimeError(f'Built bytes differ: {name}')
        if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AIza[0-9A-Za-z_-]{35}|correlativas-40c27',path.read_bytes()):
            raise RuntimeError(f'Unexpected credential/project pattern: {name}')
    (dist/'SHA256SUMS').write_text(''.join(f'{digest(paths[name].read_bytes())}  {name}\n' for name in sorted(paths)))
    paths['SHA256SUMS'] = dist/'SHA256SUMS'
    if any(digest(path.read_bytes()) != expected[name] for name,path in paths.items()): raise RuntimeError('Internal manifest differs')
    target = OUTPUT / Path(manifest['approvedZip']).name
    with zipfile.ZipFile(target,'w') as archive:
        for name in sorted(paths):
            info = zipfile.ZipInfo(name,date_time=(2026,10,15,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED; info.create_system=3; info.external_attr=0o100644<<16
            archive.writestr(info,paths[name].read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    if digest(target.read_bytes()) != manifest['approvedSHA256']: raise RuntimeError('ZIP bytes differ from approved artifact')
    if target.read_bytes() != (ROOT/manifest['approvedZip']).read_bytes(): raise RuntimeError('ZIP binary comparison failed')
    Path(str(target)+'.sha256').write_text(f'{manifest["approvedSHA256"]}  {target.name}\n')
    modules = read_json(ROOT/'.tools/mobile-integration-audit/modules.json')['included']
    packages=set(); project_modules=[]
    for module in modules:
        if re.search(r'/node_modules/(?:firebase|@firebase|@capacitor)/|/src/(?:services/|firebase)',module): raise RuntimeError('Backend/native module in bundle')
        if '/node_modules/' in module:
            if not module.startswith(str(ROOT)+'/node_modules/'): raise RuntimeError('Dependency borrowed from outside the clean root')
            package=module.split('/node_modules/',1)[1].split('/')
            packages.add('/'.join(package[:2]) if package[0].startswith('@') else package[0])
        elif module.startswith(str(ROOT)+'/'):
            name=module[len(str(ROOT))+1:]
            if name not in manifest['inputs']: raise RuntimeError(f'Undeclared source: {name}')
            project_modules.append(name)
    result={'inputsVerified':len(manifest['inputs']),'toolchain':actual,'files':expected,
            'zipSHA256':digest(target.read_bytes()),'zipBinaryIdentical':True,'sourceModules':sorted(project_modules),
            'packageFamilies':sorted(packages),'published':False}
    (OUTPUT/'result.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'zip':str(target),'sha256':result['zipSHA256'],'binaryIdentical':True,'inputs':len(manifest['inputs'])},indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--verify-only',action='store_true')
    try: run(parser.parse_args().verify_only)
    except (RuntimeError,OSError,subprocess.CalledProcessError) as error:
        print(f'REPRODUCTION FAILED: {error}',file=sys.stderr);sys.exit(1)
