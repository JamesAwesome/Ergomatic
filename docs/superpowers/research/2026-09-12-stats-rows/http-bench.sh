#!/usr/bin/env bash
# Six HTTP fetches per (user, encoding); discard run 1; median of 5.
set -euo pipefail
BASE="${BASE:-http://localhost:8099/api/stats/rows}"
for u in 1k 10k 100k; do
  for enc in identity gzip; do
    times=(); bytes=""
    for i in 1 2 3 4 5 6; do
      out=$(curl -s -H "Accept-Encoding: $enc" -o /dev/null -w '%{size_download} %{time_total}' "$BASE?u=$u")
      bytes=${out% *}; times+=("${out#* }")
    done
    printf '%s' "${times[@]:1}" >/dev/null
    med=$(printf '%s\n' "${times[@]:1}" | sort -n | awk '{a[NR]=$1} END{printf "%.1f", a[int((NR+1)/2)]*1000}')
    printf '%-6s %-9s %10s B   median %8s ms (n=5)\n' "$u" "$enc" "$bytes" "$med"
  done
done
