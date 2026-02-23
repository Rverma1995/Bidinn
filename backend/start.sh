#!/bin/bash
# Start script for Bidinn CRM Backend
cd /app/backend

# Ensure MariaDB is running
service mariadb start 2>/dev/null || true

# Wait for MariaDB to be ready
for i in {1..30}; do
    if mysql -e "SELECT 1" >/dev/null 2>&1; then
        echo "MariaDB is ready"
        break
    fi
    echo "Waiting for MariaDB... $i/30"
    sleep 1
done

# Start the Node.js backend
exec node dist/index.js
