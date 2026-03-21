"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureGoogleOAuth = configureGoogleOAuth;
exports.configureShopifyOAuth = configureShopifyOAuth;
exports.initializePassport = initializePassport;
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const passport_shopify_1 = require("passport-shopify");
// Google OAuth Strategy
function configureGoogleOAuth() {
    // Only configure Google OAuth if environment variables are set
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport_1.default.use(new passport_google_oauth20_1.Strategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                // Profile will be handled in the route
                return done(null, { provider: 'google', profile, accessToken, refreshToken });
            }
            catch (error) {
                return done(error, undefined);
            }
        }));
        console.log('✅ Google OAuth strategy configured');
    }
    else {
        console.log('⚠️ Google OAuth strategy skipped - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    }
}
// Shopify OAuth Strategy
function configureShopifyOAuth() {
    // Only configure Shopify OAuth if environment variables are set
    if (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
        passport_1.default.use(new passport_shopify_1.Strategy({
            clientID: process.env.SHOPIFY_CLIENT_ID,
            clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
            callbackURL: process.env.SHOPIFY_CALLBACK_URL || 'http://localhost:3000/api/auth/shopify/oauth/callback',
        }, async (accessToken, refreshToken, shop, done) => {
            try {
                // Shop info will be handled in the route
                return done(null, { provider: 'shopify', shop, accessToken, refreshToken });
            }
            catch (error) {
                return done(error, undefined);
            }
        }));
        console.log('✅ Shopify OAuth strategy configured');
    }
    else {
        console.log('⚠️ Shopify OAuth strategy skipped - missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET');
    }
}
// Serialize and deserialize user (optional, for session support)
passport_1.default.serializeUser((user, done) => {
    done(null, user);
});
passport_1.default.deserializeUser((user, done) => {
    done(null, user);
});
// Initialize all OAuth strategies
function initializePassport() {
    configureGoogleOAuth();
    configureShopifyOAuth();
    return passport_1.default;
}
exports.default = passport_1.default;
