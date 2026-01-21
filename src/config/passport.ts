import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as ShopifyStrategy } from 'passport-shopify';

// Google OAuth Strategy
export function configureGoogleOAuth() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Profile will be handled in the route
          return done(null, { provider: 'google', profile, accessToken, refreshToken });
        } catch (error) {
          return done(error, undefined);
        }
      }
    )
  );
}

// Shopify OAuth Strategy
export function configureShopifyOAuth() {
  passport.use(
    new ShopifyStrategy(
      {
        clientID: process.env.SHOPIFY_CLIENT_ID || '',
        clientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
        callbackURL: process.env.SHOPIFY_CALLBACK_URL || 'http://localhost:3000/api/auth/shopify/oauth/callback',
        shop: process.env.SHOPIFY_SHOP_NAME || '',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Profile will be handled in the route
          return done(null, { provider: 'shopify', profile, accessToken, refreshToken });
        } catch (error: any) {
          return done(error, undefined);
        }
      }
    )
  );
}

// Serialize and deserialize user (optional, for session support)
passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Initialize all OAuth strategies
export function initializePassport() {
  configureGoogleOAuth();
  configureShopifyOAuth();
  return passport;
}

export default passport;
