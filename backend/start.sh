#!/bin/bash
# Start script for Bidinn CRM Backend with TypeORM
cd /app/backend

echo "=== Bidinn CRM Backend Startup (TypeORM) ==="

# Build TypeScript if needed
if [ ! -d "dist" ] || [ "src/index.ts" -nt "dist/index.js" ]; then
    echo "Building TypeScript..."
    npm run build
fi

# Start the Node.js backend
echo "Starting Node.js backend with TypeORM..."
echo "Connecting to external MySQL database..."
exec node dist/index.js
