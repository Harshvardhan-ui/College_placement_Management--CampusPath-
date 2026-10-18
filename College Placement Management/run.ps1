# Start the local placement portal from this project folder.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Run the Python server file that serves the site and handles its API.
python .\server.py
