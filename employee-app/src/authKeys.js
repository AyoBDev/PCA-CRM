// The employee portal and the admin app are served from the SAME origin
// (localhost:4000 in dev, one Railway host in prod) and therefore share one
// localStorage. If both apps used the key 'token', logging into one would leak
// the session into the other. Namespacing the employee portal's keys keeps the
// two sessions independent — logging into the admin app no longer signs you into
// the portal, and vice-versa. (The server also enforces this via the token
// `surface` claim; these distinct keys are the client-side half of that boundary.)
export const TOKEN_KEY = 'emp_token';
export const USER_KEY = 'emp_user';
