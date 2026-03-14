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

const isAuthBypassEnabled = () => {
  const raw = String(process.env.AUTH_BYPASS || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') {
    return true;
  }
  if (raw === '0' || raw === 'false' || raw === 'no') {
    return false;
  }
  return process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
};

const getBypassUser = () => {
  const userIdRaw = Number(process.env.AUTH_BYPASS_USER_ID || 1);
  const userId = Number.isFinite(userIdRaw) && userIdRaw > 0 ? Math.floor(userIdRaw) : 1;
  const usernameRaw = String(process.env.AUTH_BYPASS_USERNAME || `debug_user_${userId}`)
    .trim()
    .toLowerCase();
  const username = usernameRaw || `debug_user_${userId}`;
  return {
    id: userId,
    username,
    isBypass: true,
  };
};

const createAuthMiddleware = tokenTools => (req, res, next) => {
  try {
    const token = parseBearerToken(req.header('Authorization'));
    const user = parseUserFromToken(tokenTools, token);
    if (!user) {
      if (isAuthBypassEnabled()) {
        req.user = getBypassUser();
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
      req.user = getBypassUser();
    }
  } catch {
    if (isAuthBypassEnabled()) {
      req.user = getBypassUser();
    }
  }
  next();
};

module.exports = {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
};
