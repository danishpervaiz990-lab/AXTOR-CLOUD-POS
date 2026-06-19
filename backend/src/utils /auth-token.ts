import crypto from "crypto";

export type AuthTokenPayload = {
  userId: string;
  businessId: string;
  businessSlug: string;
  email: string;
  role: string;
};

type InternalTokenPayload = AuthTokenPayload & {
  iat: number;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.AUTH_TOKEN_SECRET;

  if (!secret) {
    throw new Error("AUTH_TOKEN_SECRET is missing");
  }

  return secret;
}

function getExpirySeconds(): number {
  const value = Number(process.env.AUTH_TOKEN_EXPIRES_SECONDS || "86400");

  if (!Number.isFinite(value) || value <= 0) {
    return 86400;
  }

  return value;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string): string {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  return Buffer.from(base64, "base64").toString("utf8");
}

function signToken(header: string, payload: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createAuthToken(payload: AuthTokenPayload): string {
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT",
    }),
  );

  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + getExpirySeconds(),
    }),
  );

  const signature = signToken(header, body);

  return `${header}.${body}.${signature}`;
}

export function verifyAuthToken(token: string): InternalTokenPayload | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [header, body, signature] = parts;
    const expectedSignature = signToken(header, body);

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(body)) as InternalTokenPayload;
    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
