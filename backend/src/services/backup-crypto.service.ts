import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, open, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("AXTORBK1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  const raw = String(process.env.BACKUP_ENCRYPTION_KEY || "");
  if (raw.length < 32) throw new Error("Backup encryption key is not configured");
  return createHash("sha256").update(raw, "utf8").digest();
}

export async function encryptBackup(sourcePath: string, destinationPath: string): Promise<void> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const output = createWriteStream(destinationPath, { flags: "wx", mode: 0o600 });
  output.write(MAGIC);
  output.write(iv);
  await pipeline(createReadStream(sourcePath), cipher, output);
  await appendFile(destinationPath, cipher.getAuthTag());
}

export async function decryptBackup(sourcePath: string, destinationPath: string): Promise<void> {
  const info = await stat(sourcePath);
  if (info.size <= MAGIC.length + IV_BYTES + TAG_BYTES) throw new Error("Encrypted backup is incomplete");
  const handle = await open(sourcePath, "r");
  try {
    const header = Buffer.alloc(MAGIC.length + IV_BYTES);
    await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Encrypted backup header is invalid");
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), header.subarray(MAGIC.length));
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(sourcePath, { start: header.length, end: info.size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(destinationPath, { flags: "wx", mode: 0o600 }),
    );
  } finally {
    await handle.close();
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
