import {ApiRequestError} from '../http';
import {formatApiErrorMessage} from '../errorFormatter';

describe('formatApiErrorMessage', () => {
  it('formats ApiRequestError as code + message', () => {
    const error = new ApiRequestError({
      code: 'MODEL_UNAVAILABLE',
      message: 'provider is offline',
      requestId: 'req_123',
      status: 503,
    });

    expect(formatApiErrorMessage(error, 'fallback')).toBe(
      'MODEL_UNAVAILABLE: provider is offline',
    );
  });

  it('formats non-api Error as UNKNOWN_ERROR + message', () => {
    expect(formatApiErrorMessage(new Error('boom'), 'fallback')).toBe(
      'UNKNOWN_ERROR: boom',
    );
  });
});
