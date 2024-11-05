#!/bin/bash
# scripts/generate-certs.sh

# Create certs directory if it doesn't exist
mkdir -p certs

# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout certs/server.key -out certs/server.crt -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:*.cloudworkstations.dev"

# Set permissions
chmod 600 certs/server.key
chmod 644 certs/server.crt

echo "Certificates generated in ./certs directory"