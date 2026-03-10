#!/bin/bash
# Start script for Bidinn CRM Backend with TypeORM
cd /app/backend

echo "=== Bidinn CRM Backend Startup (TypeORM) ==="

# Check if using local database
if grep -q "DB_HOST=localhost" .env; then
    echo "Using local MariaDB database..."
    
    # Check if MariaDB is installed, if not install it
    if ! command -v mysql &> /dev/null; then
        echo "MariaDB not found, installing..."
        apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server > /dev/null 2>&1
        echo "MariaDB installed"
    fi

    # Start MariaDB if not running
    if ! pgrep -x "mariadbd" > /dev/null && ! pgrep -x "mysqld" > /dev/null; then
        echo "Starting MariaDB..."
        mysqld_safe &
        sleep 3
    fi

    # Wait for MariaDB to be ready
    echo "Waiting for MariaDB..."
    for i in {1..30}; do
        if mysqladmin ping > /dev/null 2>&1; then
            echo "MariaDB is ready"
            break
        fi
        sleep 1
    done

    # Create database if not exists
    echo "Setting up database..."
    mysql -u root -e "CREATE DATABASE IF NOT EXISTS bidinn_crm;" 2>/dev/null
    echo "Database setup complete"
else
    echo "Using external database..."
fi

# Build TypeScript if needed
if [ ! -d "dist" ] || [ "src/index.ts" -nt "dist/index.js" ]; then
    echo "Building TypeScript..."
    npm run build
fi

# Start the Node.js backend
echo "Starting Node.js backend with TypeORM..."
exec node dist/index.js
