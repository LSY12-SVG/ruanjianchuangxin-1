const colors = {
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    400: '#94A3B8',
    500: '#64748B',
    900: '#0F172A',
  },
  indigo: {
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
  },
  violet: {
    500: '#8B5CF6',
  },
};

module.exports = {
  theme: {
    extend: {
      colors,
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '2rem',
      },
      boxShadow: {
        glass: '0 12px 32px rgba(148, 163, 184, 0.14)',
        fab: '0 16px 36px rgba(99, 102, 241, 0.18)',
      },
      backdropBlur: {
        md: '16px',
      },
    },
  },
};
