const jwt = require('jsonwebtoken');

const createTokenTools = ({jwtSecret, jwtExpiresIn}) => {
  const sign = user => {
    const payload = {
      sub: String(user.id),
      username: user.username,
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
