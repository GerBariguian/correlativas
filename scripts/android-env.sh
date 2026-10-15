#!/usr/bin/env bash
# Source this file; keep all mutable tooling state inside writable workspace roots.
correlativas_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d /workspace/cloud-tools/node_modules/.bin ]; then
  export PATH="/workspace/cloud-tools/node_modules/.bin:$PATH"
fi
if [ -x /workspace/android-tooling/jdk-21.0.12.1+1/bin/javac ]; then
  export JAVA_HOME=/workspace/android-tooling/jdk-21.0.12.1+1
  export PATH="$JAVA_HOME/bin:$PATH"
fi
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Duser.home=/workspace/android-tooling/user-home -Djava.util.prefs.userRoot=/workspace/android-tooling/user-home/java-prefs"
if [ -r /etc/ssl/certs/java/cacerts ]; then
  # Reuse the platform's trusted CA store (including its managed HTTPS proxy).
  # Keep TLS verification enabled; do not alter artifact checksums or trust all certificates.
  export JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
fi
export npm_config_cache="${npm_config_cache:-/workspace/.npm-cache}"
export ANDROID_HOME="${ANDROID_HOME:-/workspace/android-tooling/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-/workspace/android-tooling/user}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/workspace/android-tooling/gradle}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/36.0.0:$PATH"
# Java tooling needs the platform's standard proxy propagated explicitly.
read -r correlativas_proxy_host correlativas_proxy_port < <(python - <<'PY'
import os,urllib.parse
p=urllib.parse.urlparse(os.environ.get('HTTPS_PROXY',os.environ.get('https_proxy','')))
print(p.hostname or '',p.port or 80)
PY
)
if [ -n "$correlativas_proxy_host" ]; then
  export GRADLE_OPTS="${GRADLE_OPTS:-} -Dhttps.proxyHost=$correlativas_proxy_host -Dhttps.proxyPort=$correlativas_proxy_port -Dhttp.proxyHost=$correlativas_proxy_host -Dhttp.proxyPort=$correlativas_proxy_port"
fi
