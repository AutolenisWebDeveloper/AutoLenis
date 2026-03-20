// Next.js middleware entry point.
// All middleware logic lives in proxy.ts; this file simply re-exports it so
// Next.js (which requires MIDDLEWARE_FILENAME = "middleware") picks it up.
export { default, config } from "./proxy"
