const path = require('path');

// Strip any directory components and unsafe characters from a client-supplied
// filename before it becomes part of a storage key. On the local-filesystem
// storage backend an un-sanitized name (e.g. "../../etc/evil") would let an
// upload endpoint write outside the uploads dir via path.join.
function safeFileName(name) {
    const base = path.basename(String(name || '')).replace(/[^A-Za-z0-9._-]/g, '_');
    return base && base !== '.' && base !== '..' ? base : 'file';
}

module.exports = { safeFileName };
