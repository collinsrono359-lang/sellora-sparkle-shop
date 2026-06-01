import crypto from "crypto";

function key(): Buffer {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  // Accept hex (64 chars) or base64 (44 chars) or raw 32-byte string
  if (/^[0-9a-f]{64}$/i.test(k)) return Buffer.from(k, "hex");
  if (k.length >= 44) {
    try {
      const b = Buffer.from(k, "base64");
      if (b.length === 32) return b;
    } catch { /* ignore */ }
  }
  // hash whatever was provided down to 32 bytes
  return crypto.createHash("sha256").update(k).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(packed: string): string {
  const [ivB, tagB, encB] = packed.split(".");
  if (!ivB || !tagB || !encB) throw new Error("Invalid encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]);
  return dec.toString("utf8");
}