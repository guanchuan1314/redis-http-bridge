const http = require('http');
const url = require('url');
const redis = require('redis');
require('dotenv').config();

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

// Connect to Redis
redisClient.connect();

// HTTP Server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    try {
        if (pathname === '/read' && req.method === 'POST') {
            // Read data from Redis
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', async () => {
                try {
                    const { key } = JSON.parse(body);

                    if (!key) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Missing required parameter: key' }));
                        return;
                    }

                    const value = await redisClient.get(key);
                    
                    if (value === null) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Key not found' }));
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, key, value }));
                    }
                } catch (error) {
                    console.error('Redis error:', error);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Failed to read data' }));
                }
            });

        } else if (pathname === '/write' && req.method === 'POST') {
            // Write data to Redis
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', async () => {
                try {
                    const { key, value } = JSON.parse(body);

                    if (!key || !value) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Missing required parameters: key, value' }));
                        return;
                    }

                    await redisClient.set(key, value);
                    
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, message: 'Data written successfully' }));
                } catch (error) {
                    console.error('Redis error:', error);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Failed to write data' }));
                }
            });

        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }

    } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
});

const PORT = process.argv[2] || process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Read data: http://localhost:${PORT}/read?key=YOUR_KEY`);
    console.log(`Write data: http://localhost:${PORT}/write?key=YOUR_KEY&value=YOUR_VALUE`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await redisClient.quit();
    process.exit(0);
});