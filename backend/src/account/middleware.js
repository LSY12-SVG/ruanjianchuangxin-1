const createAuthMiddleware = tokenTools => (req, res, next) => {
  const header = req.header('Authorization');
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    res.status(401).json({error: 'unauthorized'});
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({error: 'unauthorized'});
    return;
  }
  try {
    const payload = tokenTools.verify(token);
    req.user = {
      id: Number(payload.sub),
      username: payload.username,
    };
    next();
  } catch {
    res.status(401).json({error: 'unauthorized'});
  }
};

module.exports = {
  createAuthMiddleware,
};
