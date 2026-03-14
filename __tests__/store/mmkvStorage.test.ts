describe('mmkv storage fallback', () => {
  it('does not throw when both MMKV and AsyncStorage are unavailable', async () => {
    jest.resetModules();
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      setItem: jest.fn(async () => {
        throw new Error('disk unavailable');
      }),
      getItem: jest.fn(async () => {
        throw new Error('disk unavailable');
      }),
      removeItem: jest.fn(async () => {
        throw new Error('disk unavailable');
      }),
    }));
    jest.doMock('react-native-mmkv', () => ({
      MMKV: jest.fn(() => {
        throw new Error('mmkv unavailable');
      }),
    }));

    let mmkvStorage: {
      setItem: (name: string, value: string) => Promise<void>;
      getItem: (name: string) => Promise<string | null>;
      removeItem: (name: string) => Promise<void>;
    };
    jest.isolateModules(() => {
      ({mmkvStorage} = require('../../src/store/mmkvStorage'));
    });
    await expect(mmkvStorage.setItem('visiongenie.app.store', '{}')).resolves.toBeUndefined();
    await expect(mmkvStorage.getItem('visiongenie.app.store')).resolves.toBe('{}');
    await expect(mmkvStorage.removeItem('visiongenie.app.store')).resolves.toBeUndefined();
  });
});
