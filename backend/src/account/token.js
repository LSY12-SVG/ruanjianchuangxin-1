const jwt = require('jsonwebtoken');

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

const normalizeScopes = scopes =>
  Array.from(
    new Set(
      (Array.isArray(scopes) ? scopes : [])
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean),
    ),
  );

const readDefaultAgentScopes = () => {
  const raw = String(process.env.AGENT_DEFAULT_SCOPES || '').trim();
  if (!raw) {
    return DEFAULT_AGENT_SCOPES;
  }
  const parsed = normalizeScopes(raw.split(','));
  return parsed.length ? parsed : DEFAULT_AGENT_SCOPES;
};

const createTokenTools = ({jwtSecret, jwtExpiresIn}) => {
  const sign = user => {
    const scopes = normalizeScopes(
      Array.isArray(user?.scopes) ? user.scopes : readDefaultAgentScopes(),
    );
    const payload = {
      sub: String(user.id),
      username: user.username,
      scopes,
    };
    return jwt.sign(payload, jwtSecret, {expiresIn: jwtExpiresIn});
  };

  const verify = token => jwt.verify(token, jwtSecret);

  return {
    sign,
    verify,
  };
};

module.exports = {
  createTokenTools,
};
