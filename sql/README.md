# BrainRush SQL & Database Schema

This directory contains the database schema and migration scripts for the BrainRush Supabase project.

## Structure

- **`schema.sql`**: The base schema definition. (Note: May not include latest migrations immediately).
- **`migrations/`**: Individual migration files applied over time.

## Recent Critical Migrations (Apply in order if setting up fresh or fixing issues)

1. `migrations/robust_matchmaking.sql`: **(Essential)** Fixes ghost sessions and matchmaking queue logic.
2. `migrations/matchmaking_fix.sql`: **(Essential)** Fixes RLS issues for guest matchmaking.
3. `migrations/time_sync.sql`: Adds server-time synchronization.
4. `migrations/disconnect_logic.sql`: Handles disconnection penalties.

## How to Apply

Copy the content of the `.sql` file and run it in the Supabase SQL Editor.
