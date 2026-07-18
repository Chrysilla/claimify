import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module (better-sqlite3) and the Agent SDK's bundled CLI subprocess
  // must not be bundled by the server compiler.
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
