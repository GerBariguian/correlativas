"""Validate the actual debug APK, signing and offline assets; no third-party modules."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
apk = root / '.tools/android-artifacts/correlativas-demo-dev-0.1.0.apk'
sdk = Path(os.environ.get('ANDROID_HOME', '/workspace/android-tooling/sdk'))
tools = sdk / 'build-tools/36.0.0'
def run(tool, *args):
    return subprocess.check_output([str(tools / tool), *map(str, args)], text=True, stderr=subprocess.STDOUT)

signing = run('apksigner', 'verify', '--verbose', '--print-certs', apk)
assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in signing, signing
assert 'CN=Android Debug' in signing, 'Expected a debug certificate, never a production certificate.'
badging = run('aapt', 'dump', 'badging', apk)
assert "package: name='com.correlativas.demo.dev'" in badging
assert "versionName='0.1.0-demo'" in badging
assert "sdkVersion:'24'" in badging
assert "targetSdkVersion:'36'" in badging
assert 'application-debuggable' in badging
permissions = run('aapt', 'dump', 'permissions', apk)
assert 'android.permission.INTERNET' not in permissions, permissions
assert 'com.google.android.c2dm.permission.RECEIVE' not in permissions
with zipfile.ZipFile(apk) as z:
    assert z.testzip() is None
    names = z.namelist()
    assert not any('google-services.json' in name or name.endswith('.keystore') for name in names)
    config = json.loads(z.read('assets/capacitor.config.json'))
    assert config['appId'] == 'com.correlativas.demo.dev'
    assert not config.get('server', {}).get('url'), 'No live-reload or external app server.'
    assert config.get('server', {}).get('cleartext') is False
    assert config['plugins']['CapacitorHttp']['enabled'] is False
    html = z.read('assets/public/index.html').decode()
    assert "connect-src 'none'" in html
    assert 'Correlativas' in html
    # Check that the APK really contains the current build, byte for byte.
    files = list((root / '.tools/mobile-android-dist').rglob('*'))
    for file in files:
        if not file.is_file():
            continue
        path = 'assets/public/' + file.relative_to(root / '.tools/mobile-android-dist').as_posix()
        assert z.read(path) == file.read_bytes(), f'Stale or missing Android asset: {path}'
        assert b'correlativas-40c27' not in file.read_bytes(), f'Production project binding in {path}'
    plugins = json.loads(z.read('assets/capacitor.plugins.json'))
    assert all(plugin['pkg'] == '@capacitor/app' for plugin in plugins), plugins

report = {
    'apk': apk.name,
    'applicationId': 'com.correlativas.demo.dev',
    'version': '0.1.0-demo', 'versionCode': 1,
    'minAndroidApi': 24, 'targetAndroidApi': 36,
    'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
    'sizeBytes': apk.stat().st_size,
    'signatureV2Verified': True, 'debugCertificate': True,
    'internetPermission': False, 'firebaseProjectBinding': False,
    'bundledAssetsMatchBuild': True,
    'deviceInstallationTested': False,
}
out = apk.parent
(out / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
(out / 'SHA256SUMS').write_text(f"{report['sha256']}  {apk.name}\n")
(out / 'signing-verification.txt').write_text(signing)
(out / 'apk-badging.txt').write_text(badging)
print(json.dumps(report, indent=2))
