# Redis HTTP Bridge

A lightweight local HTTP server that provides Redis read/write access via HTTP requests. Designed for platforms that lack native Redis support, such as MQL4 (MetaTrader 4) and MQL5 (MetaTrader 5).

## Use Case

MetaTrader's MQL4/MQL5 languages can make HTTP requests but cannot connect directly to Redis. This bridge allows your trading scripts and Expert Advisors (EAs) to store and retrieve data from Redis through simple HTTP POST requests.

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here
REDIS_DB=0
PORT=3000
```

## Usage

Start the server:

```bash
# Default port (3000)
npm start

# Custom port
npm start -- 8080
# or
node index.js 8080
```

## API Endpoints

### Write Data

**POST** `/write`

```json
{
  "key": "your_key",
  "value": "your_value",
  "sync": true
}
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| key | Yes | - | Redis key |
| value | Yes | - | Value to store |
| sync | No | true | `false` = fire-and-forget (faster, no confirmation) |

Response:
```json
{
  "success": true,
  "message": "Data written successfully"
}
```

### Read Data

**POST** `/read`

```json
{
  "key": "your_key"
}
```

Response:
```json
{
  "success": true,
  "key": "your_key",
  "value": "stored_value"
}
```

## MQL4/MQL5 Example

```mql5
// Write to Redis
string WriteToRedis(string key, string value) {
    char post[], result[];
    string resultHeaders;
    string body = "{\"key\":\"" + key + "\",\"value\":\"" + value + "\"}";

    StringToCharArray(body, post, 0, StringLen(body), CP_UTF8);
    WebRequest("POST", "http://localhost:3000/write", "Content-Type: application/json", 1000, post, result, resultHeaders);

    return CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
}

// Read from Redis
string ReadFromRedis(string key) {
    char post[], result[];
    string resultHeaders;
    string body = "{\"key\":\"" + key + "\"}";

    StringToCharArray(body, post, 0, StringLen(body), CP_UTF8);
    WebRequest("POST", "http://localhost:3000/read", "Content-Type: application/json", 1000, post, result, resultHeaders);

    return CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
}
```

**Note:** Add `localhost` to the allowed URLs in MetaTrader: Tools > Options > Expert Advisors > "Allow WebRequest for listed URL".

## License

CC0 1.0 Universal - Public Domain Dedication
