#!/bin/bash
set -e
# Thin shopper client: no database of its own (Spiral Core owns all data),
# so there is no schema to push. Just install dependencies after a merge.
npm install
