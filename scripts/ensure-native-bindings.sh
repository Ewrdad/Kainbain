#!/usr/bin/env bash
# Add musl native bindings next to the gnu ones so one node_modules tree
# works on the glibc host AND in the musl (Alpine) backend container, whose
# embedded CI stages run tests against the bind-mounted project checkout.
# Idempotent. Re-run after any npm ci/install that prunes extraneous pkgs.
#   scripts/ensure-native-bindings.sh [repoRoot ...]
set -u
for root in "$@"; do
  for sub in api frontend; do
    d="$root/$sub"
    [ -d "$d/node_modules" ] || continue
    v=$(node -e "try{console.log(require('$d/node_modules/rolldown/package.json').version)}catch{console.log('')}" 2>/dev/null)
    if [ -n "$v" ] && [ ! -d "$d/node_modules/@rolldown/binding-linux-x64-musl" ]; then
      echo "rolldown musl $v -> $d"
      (cd /tmp && rm -rf kb-musl-pack && mkdir kb-musl-pack && cd kb-musl-pack && npm pack "@rolldown/binding-linux-x64-musl@$v" --silent >/dev/null 2>&1 && mkdir -p "$d/node_modules/@rolldown/binding-linux-x64-musl" && tar -xzf *.tgz -C "$d/node_modules/@rolldown/binding-linux-x64-musl" --strip-components=1 && echo OK) || echo "FAILED rolldown $d"
    fi
    lv=$(node -e "try{console.log(require('$d/node_modules/lightningcss/package.json').version)}catch{console.log('')}" 2>/dev/null)
    if [ -n "$lv" ] && [ ! -d "$d/node_modules/lightningcss-linux-x64-musl" ]; then
      echo "lightningcss musl $lv -> $d"
      (cd /tmp && rm -rf kb-musl-pack2 && mkdir kb-musl-pack2 && cd kb-musl-pack2 && npm pack "lightningcss-linux-x64-musl@$lv" --silent >/dev/null 2>&1 && mkdir -p "$d/node_modules/lightningcss-linux-x64-musl" && tar -xzf *.tgz -C "$d/node_modules/lightningcss-linux-x64-musl" --strip-components=1 && echo OK) || echo "FAILED lightningcss $d"
    fi
  done
done
