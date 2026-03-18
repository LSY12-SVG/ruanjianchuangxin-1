const {getAuthBypassUser, isAuthBypassEnabled} = require('../authBypass');

const parseBearerToken = header => {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return '';
  }
  return header.slice('Bearer '.length).trim();
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
