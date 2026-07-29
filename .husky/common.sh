# Shared hook preamble: enforce the .nvmrc Node major, loudly.
required_major="$(cat "$(git rev-parse --show-toplevel)/.nvmrc" | tr -d 'v \n')"
current="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
if [ -z "$current" ] || [ "$current" -lt "$required_major" ]; then
  echo "HOOK BLOCKED: Node >=$required_major required, found ${current:-none}." >&2
  echo "Fix: nvm use $required_major   (or: export PATH=\"\$HOME/.local/share/nvm/v26.5.0/bin:\$PATH\")" >&2
  exit 1
fi
