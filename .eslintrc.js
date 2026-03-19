module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['src/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['backend/*', '../backend/*', '../../backend/*', '../../../backend/*'],
                message: 'Frontend code in src/ must not import backend/ files directly.',
              },
            ],
          },
        ],
      },
    },
  ],
};
