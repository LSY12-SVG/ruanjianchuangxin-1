const isObject = value => typeof value === 'object' && value !== null;

const pickDefined = (...candidates) => {
  for (const value of candidates) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

const toNumberIfFinite = value => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};

module.exports = {
  isObject,
  pickDefined,
  toNumberIfFinite,
};
