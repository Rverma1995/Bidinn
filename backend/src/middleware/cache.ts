import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cache.service';
import { AuthRequest } from './auth';

/**
 * Cache middleware that stores and retrieves responses from Redis.
 * Generates a unique key based on the baseKey, the user ID, and the query parameters.
 * 
 * @param baseKey The base key prefix from CACHE_KEYS (e.g. 'leads:list')
 * @param ttlSeconds Time to live in seconds
 */
export const cacheMiddleware = (baseKey: string, ttlSeconds: number) => {
  return async (req: AuthRequest | Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Safely check for user ID (assumes AuthRequest has a user object)
      const authReq = req as AuthRequest;
      const userId = authReq.user?.id || 'anonymous';
      
      // Stringify query params to ensure distinct cache entries for different filters/pagination
      const queryStr = Object.keys(req.query).length ? JSON.stringify(req.query) : 'no_query';
      
      const cacheKey = `${baseKey}:${userId}:${queryStr}`;

      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        // Return cached response
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedData);
      }

      // If not in cache, we need to intercept the response and cache it
      const originalJson = res.json.bind(res);
      
      res.json = (body: any) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, body, ttlSeconds).catch(err => {
            console.error('Error setting cache in middleware:', err);
          });
        }
        return originalJson(body);
      };

      res.setHeader('X-Cache', 'MISS');
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      // Fail open if cache fails
      next();
    }
  };
};

/**
 * Helper to invalidate all cache entries for a specific base key.
 * Usually called in POST/PUT/DELETE controllers.
 * 
 * @param baseKey The base key prefix from CACHE_KEYS (e.g. 'leads:list')
 */
export const invalidateCache = async (baseKey: string) => {
  // We use pattern matching to delete all user and query variations of this base key
  await cacheService.delByPattern(`${baseKey}:*`);
};

/**
 * Middleware to automatically invalidate cache on successful POST/PUT/DELETE/PATCH.
 * Can be applied at the router level (e.g. router.use(invalidateCacheMiddleware(CACHE_KEYS.LEADS_LIST))).
 */
export const invalidateCacheMiddleware = (baseKeys: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          baseKeys.forEach(baseKey => {
            invalidateCache(baseKey).catch(err => {
              console.error(`Error invalidating cache for ${baseKey}:`, err);
            });
          });
        }
      });
    }
    next();
  };
};
