const http = require('http');
const redis = require('redis');
require('dotenv').config();

const DEBUG = process.env.DEBUG === 'true';

// Track Redis connection state
let isRedisConnected = false;
let reconnectTimeout = null;

// Pre-stringify static responses
const RESPONSES = {
    missingKey: JSON.stringify({ error: 'Missing required parameter: key' }),
    missingKeyValue: JSON.stringify({ error: 'Missing required parameters: key, value' }),
    keyNotFound: JSON.stringify({ error: 'Key not found' }),
    notFound: JSON.stringify({ error: 'Not found' }),
    readError: JSON.stringify({ error: 'Failed to read data' }),
    writeError: JSON.stringify({ error: 'Failed to write data' }),
    serverError: JSON.stringify({ error: 'Internal server error' }),
    redisDisconnected: JSON.stringify({ error: 'Redis temporarily unavailable, retrying...' }),
    writeSuccess: JSON.stringify({ success: true, message: 'Data written successfully' })
};

// Common headers
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

// Redis Configuration
const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        noDelay: true,
        keepAlive: 5000,
        reconnectStrategy: (retries) => {
            if (retries > 100) {
                console.error('Redis max retries reached');
                return new Error('Max retries reached');
            }
            return Math.min(retries * 100, 3000);
        }
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB) || 0
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err.message);
    isRedisConnected = false;
});

redisClient.on('connect', () => {
    console.log('Connected to Redis');
    isRedisConnected = true;
});

redisClient.on('ready', () => {
    console.log('Redis ready');
    isRedisConnected = true;
});

redisClient.on('reconnecting', () => {
    console.log('Reconnecting to Redis...');
    isRedisConnected = false;
});

redisClient.on('end', () => {
    console.log('Redis connection ended');
    isRedisConnected = false;
    attemptReconnect();
});

// Helper function to attempt reconnection
async function attemptReconnect() {
    if (reconnectTimeout) return;

    reconnectTimeout = setTimeout(async () => {
        reconnectTimeout = null;
        if (!isRedisConnected) {
            try {
                console.log('Attempting to reconnect to Redis...');
                await redisClient.connect();
            } catch (err) {
                console.error('Reconnection failed:', err.message);
                attemptReconnect();
            }
        }
    }, 2000);
}

redisClient.connect().catch(err => {
    console.error('Initial Redis connection failed:', err.message);
    attemptReconnect();
});

// Helper to collect request body
function collectBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    const pathname = req.url.split('?')[0];

    if (req.method === 'OPTIONS') {
        res.writeHead(200, CORS_HEADERS);
        res.end();
        return;
    }

    res.writeHead(200, CORS_HEADERS);

    try {
        if (pathname === '/read' && req.method === 'POST') {
            const body = await collectBody(req);
            const { key } = JSON.parse(body);

            if (!key) {
                res.statusCode = 400;
                res.end(RESPONSES.missingKey);
                return;
            }

            try {
                const value = await redisClient.get(key);

                if (value === null) {
                    DEBUG && console.log(`[READ] Key not found: ${key}`);
                    res.statusCode = 404;
                    res.end(RESPONSES.keyNotFound);
                } else {
                    DEBUG && console.log(`[READ] ${key} = ${value}`);
                    res.end(JSON.stringify({ success: true, key, value }));
                }
            } catch (redisError) {
                console.error('Redis read error:', redisError.message);
                isRedisConnected = false;
                attemptReconnect();
                res.statusCode = 503;
                res.end(RESPONSES.redisDisconnected);
            }

        } else if (pathname === '/write' && req.method === 'POST') {
            const body = await collectBody(req);
            const { key, value, sync = false } = JSON.parse(body);

            if (!key || !value) {
                res.statusCode = 400;
                res.end(RESPONSES.missingKeyValue);
                return;
            }

            try {
                if (sync) {
                    await redisClient.set(key, value);
                } else {
                    redisClient.set(key, value).catch(err => {
                        console.error('Async write error:', err.message);
                        isRedisConnected = false;
                        attemptReconnect();
                    });
                }

                DEBUG && console.log(`[WRITE] ${key} = ${value}`);
                res.end(RESPONSES.writeSuccess);
            } catch (redisError) {
                console.error('Redis write error:', redisError.message);
                isRedisConnected = false;
                attemptReconnect();
                res.statusCode = 503;
                res.end(RESPONSES.redisDisconnected);
            }

        } else {
            res.statusCode = 404;
            res.end(RESPONSES.notFound);
        }

    } catch (error) {
        console.error('Server error:', error);
        res.statusCode = 500;
        res.end(RESPONSES.serverError);
    }
});

const PORT = process.argv[2] || process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Health check interval to ensure Redis connection
setInterval(async () => {
    if (!isRedisConnected) {
        DEBUG && console.log('[HEALTH CHECK] Redis disconnected, attempting reconnect...');
        attemptReconnect();
    } else {
        try {
            await redisClient.ping();
            DEBUG && console.log('[HEALTH CHECK] Redis connection healthy');
        } catch (err) {
            console.error('[HEALTH CHECK] Redis ping failed:', err.message);
            isRedisConnected = false;
            attemptReconnect();
        }
    }
}, 30000); // Check every 30 seconds

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }
    try {
        await redisClient.quit();
    } catch (err) {
        console.error('Error during shutdown:', err.message);
    }
    process.exit(0);
});

// Handle uncaught errors to prevent server crash
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
});
