const allowedOrigins = new Set<string>();

function buildAllowedOrigins(): void {
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const replDomains = process.env.REPLIT_DOMAINS;
  if (devDomain) allowedOrigins.add(`https://${devDomain}`);
  if (replDomains) {
    replDomains.split(",").forEach((d) => {
      const trimmed = d.trim();
      if (trimmed) allowedOrigins.add(`https://${trimmed}`);
    });
  }
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://localhost:5173");
    allowedOrigins.add("http://localhost:24916");
    allowedOrigins.add("http://localhost:3001");
  }
}

buildAllowedOrigins();

export function isOriginAllowed(origin: string): boolean {
  return allowedOrigins.has(origin);
}

export { allowedOrigins };
