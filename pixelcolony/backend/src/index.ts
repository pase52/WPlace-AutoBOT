#!/usr/bin/env node

/**
 * PixelColony Backend Server
 * Main entry point for the PixelColony WebSocket backend service
 */

import server from "./server";

// Start the server
server.start().catch((error) => {
  console.error(
    "❌ Failed to start PixelColony backend server:",
    error.message
  );
  process.exit(1);
});
