#!/usr/bin/env sh
# Stop if a command fails, then run the server from this script's folder.
set -eu
cd "$(dirname "$0")"
# Python serves the website and handles its API requests.
python3 server.py
