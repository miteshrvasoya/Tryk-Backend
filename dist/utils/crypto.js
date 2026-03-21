"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.encrypt = void 0;
const crypto_1 = __importDefault(require("crypto"));
const algorithm = 'aes-256-cbc';
// Use a fixed key from environment variables or generate one if missing (fail-safe for dev, dangerous for prod if not set)
// In production, ENCRYPTION_KEY MUST be set and must be 32 chars.
const key = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
const ivLength = 16; // For AES, this is always 16
const encrypt = (text) => {
    if (!text)
        return text;
    // Verify key length
    if (key.length !== 32) {
        console.error("Encryption Key not 32 chars! Using fallback (unsafe for prod). Check ENCRYPTION_KEY env var.");
    }
    const iv = crypto_1.default.randomBytes(ivLength);
    const cipher = crypto_1.default.createCipheriv(algorithm, Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};
exports.encrypt = encrypt;
const decrypt = (text) => {
    if (!text || !text.includes(':'))
        return text; // Helper if not encrypted or plain text legacy
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto_1.default.createDecipheriv(algorithm, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
};
exports.decrypt = decrypt;
