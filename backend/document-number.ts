declare global {
  namespace Express {
    interface Request {
      tenant?: {
        businessId: string | null;
        businessSlug?: string | null;
        userId?: string | null;
        source: 'auth' | 'header' | 'future-auth' | 'system';
      };
    }
  }
}

export {};
