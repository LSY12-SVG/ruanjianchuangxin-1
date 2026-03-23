const {getAuthBypassUser, isAuthBypassEnabled} = require('../authBypass');

const DEFAULT_AGENT_SCOPES = [
  'app:read',
  'app:navigate',
  'grading:write',
  'convert:write',
  'community:read',
  'community:write',
  'community:publish',
  'settings:write',
];

const parseBearerToken = header => {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return '';
  }
  return header.slice('Bearer '.length).trim();
};

const normalizeScopes = scopes =>
  Array.from(
    new Set(
      (Array.isArray(scopes) ? scopes : [])
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean),
    ),
  );

const readCompatScopes = () => {
  const raw = String(process.env.AGENT_DEFAULT_SCOPES || '').trim();
  if (!raw) {
    return DEFAULT_AGENT_SCOPES;
  }
  const parsed = normalizeScopes(raw.split(','));
  return parsed.length ? parsed : DEFAULT_AGENT_SCOPES;
};

const parseUserFromToken = (tokenTools, token) => {
  if (!token) {
    return null;
  }
  const payload = tokenTools.verify(token);
  const userId = Number(payload.sub);
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }
  return {
    id: userId,
    username: payload.username,
    scopes: normalizeScopes(
      Array.isArray(payload.scopes) ? payload.scopes : readCompatScopes(),
    ),
  };
};

const createAuthMiddleware = tokenTools => (req, res, next) => {
  try {
    const token = parseBearerToken(req.header('Authorization'));
    const user = parseUserFromToken(tokenTools, token);
    if (!user) {
      if (isAuthBypassEnabled()) {
        req.user = getAuthBypassUser();
        next();
        return;
      }
      res.status(401).json({error: 'unauthorized'});
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({error: 'unauthorized'});
  }
};

const createOptionalAuthMiddleware = tokenTools => (req, _res, next) => {
  try {
    const token = parseBearerToken(req.header('Authorization'));
    const user = parseUserFromToken(tokenTools, token);
    if (user) {
      req.user = user;
    } else if (isAuthBypassEnabled()) {
      req.user = getAuthBypassUser();
    }
  } catch {
    if (isAuthBypassEnabled()) {
      req.user = getAuthBypassUser();
    }
  }
  next();
};

module.exports = {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
};
