const {
  sanitizeAgentPayloadForTransport,
  DEFAULT_BASE64_CHAR_LIMIT,
} = require('../../backend/src/agentPayloadSanitizer');

describe('agent payload sanitizer', () => {
  test('trims oversized base64 fields by key', () => {
    const raw = {
      image: {
        base64: 'A'.repeat(DEFAULT_BASE64_CHAR_LIMIT + 800),
      },
    };
    const sanitized = sanitizeAgentPayloadForTransport(raw);
    expect(String(sanitized.image.base64)).toContain('[base64_omitted len=');
    expect(String(sanitized.image.base64)).not.toContain('A'.repeat(200));
  });

  test('keeps short base64 values intact', () => {
    const shortValue = 'ZmFrZQ==';
    const raw = {
      image: {
        base64: shortValue,
      },
    };
    const sanitized = sanitizeAgentPayloadForTransport(raw);
    expect(sanitized.image.base64).toBe(shortValue);
  });

  test('trims oversized data-uri payloads', () => {
    const raw = {
      preview: {
        dataUrl: `data:image/jpeg;base64,${'B'.repeat(DEFAULT_BASE64_CHAR_LIMIT + 1000)}`,
      },
    };
    const sanitized = sanitizeAgentPayloadForTransport(raw);
    expect(String(sanitized.preview.dataUrl)).toContain('data:image/jpeg;base64,');
    expect(String(sanitized.preview.dataUrl)).toContain('[base64_omitted len=');
  });

  test('trims nested payloads in arrays', () => {
    const raw = {
      actionResults: [
        {
          action: {
            args: {
              image: {
                base64: 'C'.repeat(DEFAULT_BASE64_CHAR_LIMIT + 500),
              },
            },
          },
        },
      ],
    };
    const sanitized = sanitizeAgentPayloadForTransport(raw);
    expect(String(sanitized.actionResults[0].action.args.image.base64)).toContain(
      '[base64_omitted len=',
    );
  });
});
