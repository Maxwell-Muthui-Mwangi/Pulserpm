import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "rpm-secret-key-change-in-production";

export function hashPassword(password: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(password).digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function createToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (sig !== expectedSig) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}
