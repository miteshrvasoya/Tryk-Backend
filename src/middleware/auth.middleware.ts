import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {

  console.log("Auth Middleware: ", req.headers);

  const JWT_SECRET = process.env.JWT_SECRET || 'secret';

  // Try to get token from Authorization header first
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // If no token in header, try to get from cookies
  if (!token) {
    token = req.cookies?.user_token || req.cookies?.owner_token;
  }

  // Debug logging
  // console.log("Auth Middleware - Token exists:", !!token);

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      return res.sendStatus(403);
    }
    (req as any).user = user;
    next();
  });
};
