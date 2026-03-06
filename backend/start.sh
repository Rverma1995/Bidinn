#!/bin/bash
# Start script for Bidinn CRM Backend
cd /app/backend

echo "=== Bidinn CRM Backend Startup ==="

# Check if MariaDB is installed, if not install it
if ! command -v mysql &> /dev/null; then
    echo "MariaDB not found, installing..."
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server > /dev/null 2>&1
    echo "MariaDB installed"
fi

# Start MariaDB if not running
if ! pgrep -x "mysqld" > /dev/null; then
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

# Create database and user if not exists
echo "Setting up database..."
mysql -u root -e "
CREATE DATABASE IF NOT EXISTS bidinn_crm;
CREATE USER IF NOT EXISTS 'bidinn'@'localhost' IDENTIFIED BY 'bidinn_password_2024';
GRANT ALL PRIVILEGES ON bidinn_crm.* TO 'bidinn'@'localhost';
FLUSH PRIVILEGES;
" 2>/dev/null

echo "Database setup complete"

# Start the Node.js backend
echo "Starting Node.js backend..."
exec node dist/index.js
