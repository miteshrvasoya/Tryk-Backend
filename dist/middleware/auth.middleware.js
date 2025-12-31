"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const authenticateToken = (req, res, next) => {
    // Try to get token from Authorization header first
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    // If no token in header, try to get from cookies
    if (!token) {
        token = req.cookies?.user_token || req.cookies?.owner_token;
    }
    if (!token)
        return res.sendStatus(401);
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err)
            return res.sendStatus(403);
        req.user = user;
        next();
    });
};
exports.authenticateToken = authenticateToken;
