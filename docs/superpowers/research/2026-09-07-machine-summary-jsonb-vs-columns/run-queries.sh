#!/bin/bash
SP="$(dirname "$0")"
source "$SP/queries.sh"
for q in Q2A Q2B Q3A Q3B Q3A_PLUS Q3B_PLUS Q4A_MONTH Q4B_MONTH Q4A_MAX Q4B_MAX Q4A_ALL Q4B_ALL Q6A Q6B; do
  "$SP/bench.sh" "$q" "${!q}"
done
