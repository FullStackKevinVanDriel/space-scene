#!/bin/bash
while true; do
  output=$(claude -p "ping" 2>&1)
  if echo "$output" | grep -q "out of extra usage"; then
    echo "Tokens out, sleeping 300s..."
    sleep 300
  else
    claude
    break
  fi
done

claude "Continue refactor with subagents physics-worker-optimizer pooling-specialist collisions render to fix script.js explosion pauses. Use previous context."