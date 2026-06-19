declare global {
  namespace Express {
    interface Request {
      tenant?: {
        businessId: string | null;
        source: 'header' | 'future-auth' | 'system';
      };
    }
  }
}

export {};
