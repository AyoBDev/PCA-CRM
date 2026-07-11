// Shared CORS origin validator. Lives in its own module because both app.js
// (Express CORS) and socket.js (Socket.IO CORS) need it, and index.js
// requires both of those — requiring app.js from socket.js (or vice versa)
// would create a require cycle.
function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true); // same-origin / curl
  const domain = (process.env.BASE_DOMAIN || 'localhost').toLowerCase();
  let host;
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return callback(null, false); }
  const allowed =
    host === domain ||
    host.endsWith(`.${domain}`) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    [process.env.EMPLOYEE_APP_ORIGIN, process.env.ADMIN_APP_ORIGIN]
      .filter(Boolean)
      .some((o) => { try { return new URL(o).hostname.toLowerCase() === host; } catch { return false; } });
  callback(null, allowed);
}

module.exports = { corsOrigin };
