const http = require('http');
const redis = require('redis');
require('dotenv').config();

const DEBUG = process.env.DEBUG === 'true';

// Pre-stringify static responses
const RESPONSES = {
    missingKey: JSON.stringify({ error: 'Missing required parameter: key' }),
    missingKeyValue: JSON.stringify({ error: 'Missing required parameters: key, value' }),
    keyNotFound: JSON.stringify({ error: 'Key not found' }),
    notFound: JSON.stringify({ error: 'Not found' }),
    readError: JSON.stringify({ error: 'Failed to read data' }),
    writeError: JSON.stringify({ error: 'Failed to write data' }),
    serverError: JSON.stringify({ error: 'Internal server error' }),
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
        port: parseInt(process.env.REDIS_PORT) || 6379
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB) || 0
});

redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
});

redisClient.on('connect', () => {
    console.log('Connected to Redis');
});

redisClient.connect();

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

            const value = await redisClient.get(key);

            if (value === null) {
                DEBUG && console.log(`[READ] Key not found: ${key}`);
                res.statusCode = 404;
                res.end(RESPONSES.keyNotFound);
            } else {
                DEBUG && console.log(`[READ] ${key} = ${value}`);
                res.end(JSON.stringify({ success: true, key, value }));
            }

        } else if (pathname === '/write' && req.method === 'POST') {
            const body = await collectBody(req);
            const { key, value } = JSON.parse(body);

            if (!key || !value) {
                res.statusCode = 400;
                res.end(RESPONSES.missingKeyValue);
                return;
            }

            await redisClient.set(key, value);

            DEBUG && console.log(`[WRITE] ${key} = ${value}`);
            res.end(RESPONSES.writeSuccess);

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

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await redisClient.quit();
    process.exit(0);
});
