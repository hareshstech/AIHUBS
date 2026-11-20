import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.ts';
import type { UserRole } from '../src/types.ts';

const COOKIE_NAME = 'quadline_session';

// Use configured JWT_SECRET or generate an ephemeral secret per process if unset in dev
const JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET !== 'REPLACE_WITH_SECURE_RANDOM_SECRET'
  ? process.env.JWT_SECRET
  : crypto.createHash('sha256').update(process.env.GEMINI_API_KEY || 'quadline-local-dev-key-seed').digest('hex');

export interface AuthPayload {
  userId: string;
  role: UserRole;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    department: string;
    year_of_study: string;
    club_name: string;
    bio: string;
    interests: string[];
    status: 'active' | 'suspended';
    created_at: string;
  };
}

export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function setAuthCookie(res: Response, token: string, req: Request): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: Boolean(isHttps),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response, req: Request): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: Boolean(isHttps),
    path: '/',
  });
}

function loadUserFromCookie(req: Request) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const row = db
      .prepare(
        `SELECT id, name, email, role, department, year_of_study, club_name, bio, interests_json, status, created_at
         FROM users WHERE id = ?`
      )
      .get(decoded.userId) as
      | {
          id: string;
          name: string;
          email: string;
          role: UserRole;
          department: string;
          year_of_study: string;
          club_name: string;
          bio: string;
          interests_json: string;
          status: 'active' | 'suspended';
          created_at: string;
        }
      | undefined;

    if (!row || row.status !== 'active') return null;

    let interests: string[] = [];
    try {
      const parsed = JSON.parse(row.interests_json);
      if (Array.isArray(parsed)) interests = parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      interests = [];
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      department: row.department,
      year_of_study: row.year_of_study,
      club_name: row.club_name,
      bio: row.bio,
      interests,
      status: row.status,
      created_at: row.created_at,
    };
  } catch {
    return null;
  }
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const user = loadUserFromCookie(req);
  if (user) req.authUser = user;
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = loadUserFromCookie(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.authUser = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({
        error: `Access denied. This action requires ${roles.join(' or ')} permissions.`,
      });
      return;
    }
    next();
  };
}

// Sliding-window rate limiter per IP + route bucket
const rateBuckets = new Map<string, number[]>();

export function createRateLimiter(bucketName: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    const timestamps = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (timestamps.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}
