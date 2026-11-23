#!/bin/bash
cd ~/repos/MMD-modoki
. ~/.nvm/nvm.sh >/dev/null 2>&1
run() { # round scene config
  local round=$1 scene=$2 cfg=$3
  echo "=== round=$round scene=$scene cfg=$cfg start $(date +%T)"
  if [ "$cfg" = main ]; then
    MMD_MODOKI_PNG_ENCODER=main BENCH_WARMUP=1 node scripts/bench-png-workers.local.mjs 3 $scene 2>&1 | grep -E "PNG_RUN|Error" | sed "s/^/round=$round cfg=$cfg /"
  else
    MMD_MODOKI_PNG_WORKERS=$cfg BENCH_WARMUP=1 node scripts/bench-png-workers.local.mjs 3 $scene 2>&1 | grep -E "PNG_RUN|Error" | sed "s/^/round=$round cfg=$cfg /"
  fi
}
for scene in empty tofu-plate-ssgi-dof; do for cfg in main 1 2; do run 1 $scene $cfg; done; done
for scene in tofu-plate-ssgi-dof empty; do for cfg in 2 1 main; do run 2 $scene $cfg; done; done
echo DONE $(date +%T)
