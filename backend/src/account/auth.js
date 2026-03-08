const bcrypt = require('bcryptjs');

const isNonEmpty = value => typeof value === 'string' && value.trim().length > 0;

const normalizeUsername = value => String(value || '').trim().toLowerCase();

const asSafeUser = user => ({
  id: String(user.id),
  username: user.username,
  displayName: user.display_name || user.username,
  avatarUrl: user.avatar_url || '',
  tier: user.tier || 'Vision Creator · Pro',
});

const createAuthService = ({repo, tokenTools}) => {
  const register = async payload => {
    const username = normalizeUsername(payload?.username);
    const password = String(payload?.password || '');
    if (!isNonEmpty(username) || !isNonEmpty(password)) {
      return {error: 'validation_failed'};
    }
    const exists = await repo.findUserByUsername(username);
    if (exists) {
      return {error: 'username_taken'};
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await repo.createUser({username, passwordHash});
    const token = tokenTools.sign(user);
    return {
      token,
      user: asSafeUser(user),
    };
  };

  const login = async payload => {
    const username = normalizeUsername(payload?.username);
    const password = String(payload?.password || '');
    if (!isNonEmpty(username) || !isNonEmpty(password)) {
      return {error: 'validation_failed'};
    }
    const user = await repo.findUserByUsername(username);
    if (!user) {
      return {error: 'invalid_credentials'};
    }
    const matched = await bcrypt.compare(password, user.password_hash);
    if (!matched) {
      return {error: 'invalid_credentials'};
    }
    const token = tokenTools.sign(user);
    return {
      token,
      user: asSafeUser(user),
    };
  };

  return {
    register,
    login,
  };
};

module.exports = {
  createAuthService,
};
