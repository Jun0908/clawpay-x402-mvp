import path from "node:path";

export function getRuntimeDataDir(): string {
  if (process.env.VERCEL === "1") {
    return path.join("/tmp", "clawpay-data");
  }

  return path.resolve(process.cwd(), "data");
}
