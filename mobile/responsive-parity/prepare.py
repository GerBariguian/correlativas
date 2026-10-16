"""Build and package the isolated responsive demo. Does not commit or deploy."""
from pathlib import Path
import hashlib, json, re, subprocess, zipfile
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.tools/mobile-241'
sha=lambda data:hashlib.sha256(data).hexdigest()

def prepare():
    # Frozen base sources and previous artifact must remain byte-identical.
    manifest=json.loads((ROOT/'mobile/reproducible-base/inputs.lock.json').read_text())
    inputs=dict(manifest['inputs'])
    for name,expected in inputs.items():
        assert sha((ROOT/name).read_bytes())==expected, f'Approved source changed: {name}'
    assert sha((ROOT/manifest['approvedZip']).read_bytes())==manifest['approvedSHA256']
    for name in ['index.html','main.jsx','responsive.css','viewport.js','vite.config.mjs']:
        path='mobile/responsive-parity/'+name
        inputs[path]=sha((ROOT/path).read_bytes())
    subprocess.run(['node','node_modules/vite/bin/vite.js','build','--config','mobile/responsive-parity/vite.config.mjs'],cwd=ROOT,check=True)
    dist=OUT/'dist'
    paths={p.relative_to(dist).as_posix():p for p in dist.rglob('*') if p.is_file() and p.name!='SHA256SUMS'}
    assert len(paths)==5 and set(paths)=={'index.html','_headers',*[n for n in paths if re.fullmatch(r'assets/(index-[\w-]+\.(js|css)|logo-[\w-]+\.png)',n)]}
    for extension in ['js','css','png']:
        assert sum(name.endswith('.'+extension) for name in paths)==1
    assert paths['_headers'].read_bytes()==(ROOT/'mobile/safari-demo-site/_headers').read_bytes()
    for name,path in paths.items():
        assert not path.is_symlink()
        assert not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AIza[0-9A-Za-z_-]{35}|correlativas-40c27',path.read_bytes()),name
    modules=json.loads((ROOT/'.tools/mobile-integration-audit/modules.json').read_text())['included']
    packages=set()
    for module in modules:
        assert not re.search(r'/node_modules/(firebase|@firebase|@capacitor)/|/src/(services/|firebase)',module),module
        if '/node_modules/' in module:
            assert module.startswith(str(ROOT)+'/node_modules/'),module
            parts=module.split('/node_modules/',1)[1].split('/')
            packages.add('/'.join(parts[:2]) if parts[0].startswith('@') else parts[0])
        elif module.startswith(str(ROOT)+'/'):
            assert module[len(str(ROOT))+1:] in inputs,module
    hashes={name:sha(path.read_bytes()) for name,path in sorted(paths.items())}
    (dist/'SHA256SUMS').write_text(''.join(f'{h}  {name}\n' for name,h in hashes.items()))
    hashes['SHA256SUMS']=sha((dist/'SHA256SUMS').read_bytes())
    archive=OUT/'correlativas-mobile-241-responsive-parity.zip'
    with zipfile.ZipFile(archive,'w') as z:
        for name in sorted(hashes):
            info=zipfile.ZipInfo(name,date_time=(2026,10,16,0,0,0));info.create_system=3;info.external_attr=0o100644<<16
            z.writestr(info,(dist/name).read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None and set(z.namelist())==set(hashes)
        assert all(sha(z.read(name))==h for name,h in hashes.items())
    digest=sha(archive.read_bytes())
    Path(str(archive)+'.sha256').write_text(f'{digest}  {archive.name}\n')
    report={'baseCommit':'1d68ddcf172247652e0aa7eb5f4d48065bbaadcc','approvedBaseSHA256':manifest['approvedSHA256'],'baseInputsUnchanged':75,'inputs':inputs,'files':hashes,'zipSHA256':digest,'packageFamilies':sorted(packages),'published':False}
    (OUT/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    subprocess.run(['sha256sum','-c','SHA256SUMS'],cwd=dist,check=True)
    print(json.dumps({'zip':str(archive),'sha256':digest,'files':len(hashes)},indent=2))
if __name__=='__main__': prepare()
