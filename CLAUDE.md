# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A lightweight local HTTP server that bridges Redis for platforms without native Redis support. Primary use case is enabling MQL4 (MetaTrader 4) and MQL5 (MetaTrader 5) scripts to read/write Redis data via HTTP requests.

## Commands

```bash
# Install dependencies
npm install

# Run the server (default port 3000)
npm start

# Run on a specific port
npm start -- 8080
# or
node index.js 8080
```

## Architecture

The entire application is contained in `index.js`:
- Uses Node.js built-in `http` module (no Express)
- Connects to Redis using the `redis` package
- Exposes two POST endpoints:
  - `POST /read` - Retrieves a value by key (body: `{"key": "..."}`)
  - `POST /write` - Stores a key-value pair (body: `{"key": "...", "value": "..."}`)

## Configuration

Environment variables (configured via `.env` file, see `.env.example`):
- `REDIS_HOST` - Redis server host (default: localhost)
- `REDIS_PORT` - Redis server port (default: 6379)
- `REDIS_PASSWORD` - Redis password (optional)
- `REDIS_DB` - Redis database number (default: 0)
- `PORT` - HTTP server port (default: 3000)

## Dependencies

- `redis` - Redis client
- `dotenv` - Environment variable management
