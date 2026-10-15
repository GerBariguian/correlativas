#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
cd "$correlativas_repo_root"
if [ ! -f "$ANDROID_HOME/platforms/android-36/android.jar" ] || [ ! -x "$ANDROID_HOME/build-tools/36.0.0/apksigner" ]; then
  echo 'Android SDK missing. Run bash scripts/android-setup.sh first.' >&2
  exit 1
fi
mkdir -p .tools/android-signing .tools/android-artifacts
if [ ! -f .tools/android-signing/debug.keystore ]; then
  keytool -genkeypair -keystore .tools/android-signing/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname 'CN=Android Debug,O=Android,C=US' -keyalg RSA -keysize 2048 -validity 10000
fi
npm run mobile:sync
cd mobile/android-demo/android
./gradlew --no-daemon --max-workers=2 --console=plain :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
cd "$correlativas_repo_root"
cp mobile/android-demo/android/app/build/outputs/apk/debug/app-debug.apk .tools/android-artifacts/correlativas-demo-dev-0.1.0.apk
python scripts/verify-demo-apk.py
