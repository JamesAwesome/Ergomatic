#!/usr/bin/env bash
# Single version authority: annotated git tags (hatch-vcs style).
# VERSION  = latest tag without the leading v (0.0.0 before any tag)
# BUILD    = monotonic commit count (Apple requires ever-increasing builds)
# DESCRIBE = human string, e.g. v0.1.0-14-ga1b2c3d (or bare sha pre-tag)
set -euo pipefail
TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0)"
echo "VERSION=${TAG#v}"
echo "BUILD=$(git rev-list --count HEAD)"
echo "DESCRIBE=$(git describe --tags --always --dirty)"
