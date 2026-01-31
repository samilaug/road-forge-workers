import { betterAuth } from 'better-auth';
import { d1Adapter } from 'better-auth/adapters/d1';
import type { Env } from './types';

/**
 * Create Better Auth instance for the given environment
 * Note: We create a new instance per request since env bindings are request-scoped
 */
export function createAuth(env: Env) {
  return betterAuth({
    database: d1Adapter(env.DB, {
      usePlural: false, // Use singular table names (user, session, account)
    }),
    baseURL: 'https://api.roadforge.app',
    basePath: '/auth',
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Can enable later
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    trustedOrigins: [
      'https://roadforge.app',
      'http://localhost:3000',
    ],
    advanced: {
      generateId: () => crypto.randomUUID(),
    },
  });
}

/**
 * Get session from request (for protected routes)
 */
export async function getSession(request: Request, env: Env) {
  const auth = createAuth(env);
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  return session;
}
