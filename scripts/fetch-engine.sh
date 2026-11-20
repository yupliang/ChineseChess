#!/usr/bin/env bash
# 下载 Pikafish WASM 引擎文件到 apps/web/public/engine/pikafish/
#
# 为什么不用 pikafish-wasm v0.1.0 release + 官方 master-net：
#   release 的 wasm 编译时绑定了固定权重的哈希（7d13d735…），而上游
#   Networks 的 master-net 是滚动覆盖的（当前 071aefc0…，2026-11-14 替换），
#   release 本身又没上传权重，导致 engine 报
#   "Network evaluation parameters compatible with the engine must be available"
#   直接退出。这里改用一套自洽的引擎+权重（Pikafish dev-20261110 + CC0 权重，
#   约 11MB），二者版本匹配，且权重是 CC0，商用也无授权问题。
set -euo pipefail

BASE="https://mistboard.com/engine/pikafish"
NET_NAME="xiangqi-c07e94a5c7cb.nnue"
OUT="apps/web/public/engine/pikafish"

mkdir -p "$OUT"

dl() { # $1=url $2=outfile
  if [ -f "$2" ] && [ -s "$2" ]; then
    echo "已存在，跳过: $2"
  else
    echo "下载: $2"
    curl -L --fail --retry 3 -o "$2" "$1"
  fi
}

dl "$BASE/pikafish.js"   "$OUT/pikafish.js"
dl "$BASE/pikafish.wasm" "$OUT/pikafish.wasm"
dl "$BASE/worker.js"     "$OUT/worker.js"
dl "$BASE/$NET_NAME"     "$OUT/pikafish.nnue"

echo ""
echo "完成，文件列表："
ls -lh "$OUT"
