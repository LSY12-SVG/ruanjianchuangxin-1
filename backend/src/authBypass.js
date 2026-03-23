const ENABLE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLE_VALUES = new Set(['0', 'false', 'no', 'off']);

const isAuthBypassEnabled = () => {
  const raw = String(process.env.AUTH_BYPASS || '')
    .trim()
    .toLowerCase();
  if (ENABLE_VALUES.has(raw)) {
    return true;
  }
  if (DISABLE_VALUES.has(raw)) {
    return false;
  }
  return false;
};

const getAuthBypassUser = () => {
  const userIdRaw = Number(process.env.AUTH_BYPASS_USER_ID || 1);
  const userId = Number.isFinite(userIdRaw) && userIdRaw > 0 ? Math.floor(userIdRaw) : 1;
  const usernameRaw = String(process.env.AUTH_BYPASS_USERNAME || `debug_user_${userId}`)
    .trim()
    .toLowerCase();
  return {
    id: userId,
    username: usernameRaw || `debug_user_${userId}`,
    isBypass: true,
    scopes: ['*'],
  };
};

module.exports = {
  isAuthBypassEnabled,
  getAuthBypassUser,
};
