# Flashstrom Fake Backend

A NestJS-based fake backend that ensures each entity array has enough data by checking and generating as needed. This backend connects to the real backend and maintains data pools with Redis caching.

## Features

- **Data Pool Management**: Ensures each entity has at least 10 items
- **Redis Caching**: Caches data pools for performance
- **Sequential Data Generation**: Follows the specified entity creation order
- **Real Backend Integration**: Connects to the real backend to check and create data

## Entity Generation Flow

The fake backend follows this specific order for data generation:

1. **Address Books** (`/address_books`)
2. **Food Categories** (`/food_categories`)
3. **Super Admins** (`/auth/register-super-admin`)
4. **Finance Admins** (`/auth/register-finance-admin`)
5. **Companion Admins** (`/auth/register-companion-admin`)
6. **Finance Rules** (`/finance_rules`)
7. **Restaurants** (`/restaurants`)
8. **Menu Items** (`/menu_items`)
9. **Menu Item Variants** (`/menu_item_variants`)
10. **Promotions** (`/promotions`)
11. **Drivers** (`/drivers`)
12. **Customers** (`/customers`)
13. **Customer Cares** (`/customer_cares`)
14. **Orders** (`/orders`)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:
```env
PORT=3001
REAL_BACKEND_URL=http://localhost:1310
REDIS_URL=redis://localhost:6379
MIN_POOL_SIZE=10
CACHE_TTL=3600
```

## Running the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### Health Check
- `GET /` - Welcome message
- `GET /health` - Health status

### Data Pool Management
- `GET /data-pools` - Get current data pools (from cache if available)
- `POST /data-pools/ensure` - Ensure all data pools have enough data
- `POST /data-pools/refresh` - Clear cache and regenerate data pools

## How It Works

1. **Initialization**: On startup, the service automatically ensures all data pools have sufficient data
2. **Check Phase**: For each entity, it calls `GET` endpoint to check current data count
3. **Generation Phase**: If count < minimum (10), it generates missing items via `POST` endpoints
4. **Caching**: Results are cached in Redis for performance
5. **Sequential Processing**: Entities are processed in the specified order to handle dependencies

## Redis Caching

The service uses Redis to cache:
- Complete data pools (`data-pools:all`)
- Individual entity results
- TTL-based expiration (default: 1 hour)

## Error Handling

- Graceful handling of real backend connection issues
- Retry logic for failed data generation
- Detailed logging for debugging
- Fallback to empty arrays if generation fails

## Development

```bash
# Watch mode
npm run start:dev

# Debug mode
npm run start:debug

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Fake backend port | `3001` |
| `REAL_BACKEND_URL` | Real backend URL | `http://localhost:1310` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `MIN_POOL_SIZE` | Minimum items per entity | `10` |
| `CACHE_TTL` | Cache TTL in seconds | `3600` |

## Usage Example

1. Start the real backend on port 1310
2. Start Redis server
3. Start this fake backend:
```bash
npm run start:dev
```

4. The service will automatically ensure data pools on startup
5. Access data pools via API:
```bash
curl http://localhost:3001/data-pools
```

6. Force refresh data pools:
```bash
curl -X POST http://localhost:3001/data-pools/refresh
```
