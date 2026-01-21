declare module 'passport-shopify' {
  import { Strategy as PassportStrategy } from 'passport-strategy';
  
  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    shop?: string;
    apiVersion?: string;
  }
  
  export interface Profile {
    provider: string;
    id: string;
    displayName: string;
    emails?: Array<{ value: string; verified?: boolean }>;
    _raw: string;
    _json: any;
  }
  
  export type VerifyCallback = (err?: Error | null, user?: any, info?: any) => void;
  
  export type VerifyFunction = (
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback
  ) => void;
  
  export class Strategy extends PassportStrategy {
    constructor(options: StrategyOptions, verify: VerifyFunction);
    name: string;
    authenticate(req: any, options?: any): void;
  }
}
