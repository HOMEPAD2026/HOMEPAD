#!/bin/sh
# Builds the program for a given program id: ./build.sh <PROGRAM_ID>  →  deploy/arcircle_orders.so
# Needs the Solana (Agave) CLI with cargo-build-sbf on PATH. declare_id! in src/lib.rs is set to the id for the build
# and put back afterwards, so the source in git keeps its placeholder.
set -e
cd "$(dirname "$0")"
ID="$1"
[ -n "$ID" ] || { echo "usage: ./build.sh <PROGRAM_ID>"; exit 1; }
cp src/lib.rs /tmp/arcircle-orders-lib.rs.bak
trap 'cp /tmp/arcircle-orders-lib.rs.bak src/lib.rs' EXIT
sed -i.tmp "s/declare_id!(\"[^\"]*\")/declare_id!(\"$ID\")/" src/lib.rs && rm -f src/lib.rs.tmp
cargo-build-sbf
mkdir -p deploy
cp target/deploy/arcircle_orders.so deploy/arcircle_orders.so
echo "$ID" > deploy/PROGRAM_ID
sha256sum deploy/arcircle_orders.so | tee deploy/SHA256
