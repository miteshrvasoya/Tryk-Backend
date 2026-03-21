"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authenticateToken = (req, res, next) => {
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
    if (!token)
        return res.sendStatus(401);
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error("JWT Verification Error:", err.message);
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    });
};
exports.authenticateToken = authenticateToken;
