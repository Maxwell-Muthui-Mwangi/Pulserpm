import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

function getJwtSecret(): string {
  const secret = process.env.SCHEDULER_JWT_SECRET;
  if (!secret) {
    throw new Error("SCHEDULER_JWT_SECRET environment variable is required");
  }
  return secret;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(tutorId: number): string {
  return jwt.sign({ tutorId, type: "scheduler" }, getJwtSecret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): { tutorId: number; type: string } {
  return jwt.verify(token, getJwtSecret()) as { tutorId: number; type: string };
}
