#!/bin/bash
# Baseline migration from existing database
# Run this ONCE to set up Prisma Migrations on an existing project.
#
# Prerequisites:
#   - DATABASE_URL is set in .env
#   - The database already has the correct schema
#
# Steps:
#   1. Generate SQL from current schema
#   2. Mark the migration as already applied

set -e

echo "Creating baseline migration from current schema..."
mkdir -p prisma/migrations/0_init

npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql

echo "Marking baseline migration as applied..."
npx prisma migrate resolve --applied 0_init

echo "Done! Future schema changes can use: npm run migrate:dev"
