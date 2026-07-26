import crypto from "crypto";

const SCRYPT_PREFIX = "scrypt";

function isHex(value: string): boolean {
  return /^[a-f0-9]+$/i.test(value) && value.length % 2 === 0;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");

  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split("$");

    if (parts.length !== 3) {
      return false;
    }

    const [prefix, salt, hash] = parts;

    if (prefix !== SCRYPT_PREFIX || !salt || !hash) {
      return false;
    }

    let storedBuffer: Buffer;
    let derivedBuffer: Buffer;

    if (isHex(hash)) {
      storedBuffer = Buffer.from(hash, "hex");
      derivedBuffer = crypto.scryptSync(password, salt, storedBuffer.length);
    } else {
      storedBuffer = Buffer.from(hash, "base64");
      derivedBuffer = crypto.scryptSync(password, salt, storedBuffer.length);
    }

    if (storedBuffer.length !== derivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(storedBuffer, derivedBuffer);
  } catch {
    return false;
  }
}
