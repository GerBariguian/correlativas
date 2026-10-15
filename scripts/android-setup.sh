#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
mkdir -p /workspace/android-tooling/user-home/java-prefs "$ANDROID_HOME" "$ANDROID_USER_HOME" "$GRADLE_USER_HOME" /workspace/android-tooling/downloads
correlativas_javac_version="$(javac -version 2>&1 || true)"
if [[ "$correlativas_javac_version" != *"javac 21."* ]]; then
  jdk_archive=/workspace/android-tooling/downloads/temurin21-jdk.tar.gz
  if [ ! -f "$jdk_archive" ]; then
    curl -fSL --retry 2 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz' -o "$jdk_archive"
  fi
  echo "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94  $jdk_archive" | sha256sum -c -
  tar -xzf "$jdk_archive" -C /workspace/android-tooling
  export JAVA_HOME=/workspace/android-tooling/jdk-21.0.12.1+1
  export PATH="$JAVA_HOME/bin:$PATH"
fi
javac -version
archive=/workspace/android-tooling/downloads/commandlinetools-linux-16111833.zip
if [ ! -f "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  if [ ! -f "$archive" ]; then
    curl -fSL --retry 2 https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip -o "$archive"
  fi
  echo "e025545c62a8e64c7559119566a569fb1dec5f60  $archive" | sha1sum -c -
  python - "$archive" "$ANDROID_HOME" <<'PY'
import sys,zipfile,pathlib,shutil
archive,sdk=sys.argv[1:]
target=pathlib.Path(sdk)/'cmdline-tools'
with zipfile.ZipFile(archive) as z: z.extractall(target)
shutil.move(str(target/'cmdline-tools'),str(target/'latest'))
for path in (target/'latest'/'bin').iterdir(): path.chmod(0o755)
PY
fi
proxy_args=()
if [ -n "$correlativas_proxy_host" ]; then
  proxy_args=(--proxy=http "--proxy_host=$correlativas_proxy_host" "--proxy_port=$correlativas_proxy_port")
fi
# Android SDK installation only; no credentials or production services.
sdkmanager --sdk_root="$ANDROID_HOME" "${proxy_args[@]}" --licenses < <(yes 2>/dev/null)
sdkmanager --sdk_root="$ANDROID_HOME" "${proxy_args[@]}" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
java -version
sdkmanager --version
