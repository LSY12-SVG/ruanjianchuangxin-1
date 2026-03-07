import {parseLocalVoiceCommand} from '../../src/voice/localParser';

describe('parseLocalVoiceCommand', () => {
  it('parses adjust command for brightness', () => {
    const result = parseLocalVoiceCommand('亮度加20');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'brightness',
      delta: 20,
    });
  });

  it('parses set command for temperature', () => {
    const result = parseLocalVoiceCommand('色温调到30');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'set_param',
      target: 'temperature',
      value: 30,
    });
  });

  it('supports chinese numbers', () => {
    const result = parseLocalVoiceCommand('亮度加十');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'brightness',
      delta: 10,
    });
  });

  it('parses soft constraint phrase', () => {
    const result = parseLocalVoiceCommand('不要太黄');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'temperature',
    });
    const action = result.actions[0];
    if (action.action === 'adjust_param') {
      expect(action.delta).toBeLessThan(0);
    }
  });

  it('parses multi-command sentence', () => {
    const result = parseLocalVoiceCommand('对比度调到20，饱和度减5');
    expect(result.actions.length).toBeGreaterThanOrEqual(2);
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'set_param',
          target: 'contrast',
          value: 20,
        }),
        expect.objectContaining({
          action: 'adjust_param',
          target: 'saturation',
          delta: -5,
        }),
      ]),
    );
  });

  it('falls back to style for abstract text', () => {
    const result = parseLocalVoiceCommand('来点复古胶片感');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'apply_style',
      style: 'vintage_fade',
    });
  });

  it('returns empty actions for unknown text', () => {
    const result = parseLocalVoiceCommand('今天心情不错');
    expect(result.actions).toHaveLength(0);
    expect(result.fallbackUsed).toBe(true);
  });

  it('parses decimal exposure command', () => {
    const result = parseLocalVoiceCommand('曝光加0.3');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'exposure',
      delta: 0.3,
    });
  });

  it('parses highlights and shadows commands', () => {
    const result = parseLocalVoiceCommand('高光减20，然后阴影加15');
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'adjust_param',
          target: 'highlights',
          delta: -20,
        }),
        expect.objectContaining({
          action: 'adjust_param',
          target: 'shadows',
          delta: 15,
        }),
      ]),
    );
  });

  it('parses rgb channel command', () => {
    const result = parseLocalVoiceCommand('蓝色通道减8');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'blueBalance',
      delta: -8,
    });
  });

  it('supports follow-up phrase with previous target context', () => {
    const result = parseLocalVoiceCommand('再来一点', {lastTarget: 'temperature'});
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'temperature',
    });
  });

  it('parses pro curve command', () => {
    const result = parseLocalVoiceCommand('主曲线加12');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'curve_master',
      delta: 12,
    });
  });

  it('parses color wheel command', () => {
    const result = parseLocalVoiceCommand('阴影色轮减8');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'wheel_shadows',
      delta: -8,
    });
  });
});
