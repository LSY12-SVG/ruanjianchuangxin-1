import {
  canTriggerFirstPass,
  createFirstPassGate,
  markFirstPassTriggered,
  openFirstPassGate,
} from '../../src/colorEngine/firstPassGate';

describe('first pass gate', () => {
  it('triggers only once for the same image session key', () => {
    const gate = createFirstPassGate();
    openFirstPassGate(gate, 'img_a');

    expect(canTriggerFirstPass(gate, 'img_a')).toBe(true);
    markFirstPassTriggered(gate, 'img_a');
    expect(canTriggerFirstPass(gate, 'img_a')).toBe(false);
  });

  it('re-opens for a new image session key', () => {
    const gate = createFirstPassGate();
    openFirstPassGate(gate, 'img_a');
    markFirstPassTriggered(gate, 'img_a');

    expect(canTriggerFirstPass(gate, 'img_b')).toBe(true);
    markFirstPassTriggered(gate, 'img_b');
    expect(canTriggerFirstPass(gate, 'img_b')).toBe(false);
  });
});
