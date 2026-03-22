import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as ShopifyStrategy } from 'passport-shopify';

// Google OAuth Strategy
export function configureGoogleOAuth() {
  // Only configure Google OAuth if environment variables are set
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3333/api/auth/google/callback',
        },
        async (accessToken: any, refreshToken: any, profile: any, done: any) => {
          try {
            // Profile will be handled in the route
            return done(null, { provider: 'google', profile, accessToken, refreshToken });
          } catch (error: any) {
            return done(error, undefined);
          }
        }
      )
    );
    console.log('✅ Google OAuth strategy configured');
  } else {
    console.log('⚠️ Google OAuth strategy skipped - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
}

// Shopify OAuth Strategy
export function configureShopifyOAuth() {
  // Only configure Shopify OAuth if environment variables are set
  if (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
    passport.use(
      new ShopifyStrategy(
        {
          clientID: process.env.SHOPIFY_CLIENT_ID,
          clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
          callbackURL: process.env.SHOPIFY_CALLBACK_URL || 'http://localhost:3333/api/auth/shopify/oauth/callback',
        },
        async (accessToken: any, refreshToken: any, shop: any, done: any) => {
          try {
            // Shop info will be handled in the route
            return done(null, { provider: 'shopify', shop, accessToken, refreshToken });
          } catch (error: any) {
            return done(error, undefined);
          }
        }
      )
    );
    console.log('✅ Shopify OAuth strategy configured');
  } else {
    console.log('⚠️ Shopify OAuth strategy skipped - missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET');
  }
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
