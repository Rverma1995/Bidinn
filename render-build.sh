#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Building Bidinn CRM for Render..."

echo "1/2: Building Frontend..."
cd frontend
yarn install --production=false
DISABLE_ESLINT_PLUGIN=true FAST_REFRESH=false yarn build
cd ..

echo "2/2: Building Backend..."
cd backend
yarn install --production=false
yarn build
cd ..

echo "Build complete! Ready for deployment."
