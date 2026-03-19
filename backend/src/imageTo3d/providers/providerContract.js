function assertProviderContract(provider) {
  const missingMembers = [];

  if (!provider || typeof provider !== 'object') {
    throw new Error('Provider factory did not return an object.');
  }

  if (!provider.name || typeof provider.name !== 'string') {
    missingMembers.push('name');
  }

  if (typeof provider.submitJob !== 'function') {
    missingMembers.push('submitJob');
  }

  if (typeof provider.getJob !== 'function') {
    missingMembers.push('getJob');
  }

  if (missingMembers.length > 0) {
    throw new Error(`Provider is missing required members: ${missingMembers.join(', ')}`);
  }

  return provider;
}

module.exports = {
  assertProviderContract,
};
