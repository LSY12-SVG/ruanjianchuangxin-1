import {createAvatarStateCommand, parseAvatarRendererMessage} from '../../src/assistant/bridge';

describe('assistant avatar bridge', () => {
  it('creates renderer state command payload', () => {
    expect(createAvatarStateCommand('thinking')).toBe('{"type":"state","state":"thinking"}');
  });

  it('parses valid renderer messages', () => {
    expect(parseAvatarRendererMessage('{"type":"loaded"}')).toEqual({type: 'loaded'});
    expect(parseAvatarRendererMessage('{"type":"tap"}')).toEqual({type: 'tap'});
  });

  it('returns null on malformed payload', () => {
    expect(parseAvatarRendererMessage('')).toBeNull();
    expect(parseAvatarRendererMessage('oops')).toBeNull();
    expect(parseAvatarRendererMessage('{"type":"noop"}')).toBeNull();
  });
});
