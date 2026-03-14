import type {Lut3D} from '../../types/colorEngine';

const toNumber = (value: string): number => Number(value.trim());

export const parseCubeLut = (content: string, id = `lut_${Date.now()}`): Lut3D => {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  let title = 'Untitled LUT';
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const data: number[] = [];

  lines.forEach(line => {
    if (line.startsWith('TITLE')) {
      title = line.replace(/^TITLE\s+/, '').replace(/"/g, '').trim() || title;
      return;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      size = toNumber(line.replace('LUT_3D_SIZE', ''));
      return;
    }
    if (line.startsWith('DOMAIN_MIN')) {
      const values = line
        .replace('DOMAIN_MIN', '')
        .trim()
        .split(/\s+/)
        .map(toNumber);
      domainMin = [values[0] || 0, values[1] || 0, values[2] || 0];
      return;
    }
    if (line.startsWith('DOMAIN_MAX')) {
      const values = line
        .replace('DOMAIN_MAX', '')
        .trim()
        .split(/\s+/)
        .map(toNumber);
      domainMax = [values[0] || 1, values[1] || 1, values[2] || 1];
      return;
    }

    const values = line.split(/\s+/).map(toNumber);
    if (values.length === 3 && values.every(v => Number.isFinite(v))) {
      data.push(values[0], values[1], values[2]);
    }
  });

  if (size <= 1) {
    throw new Error('LUT_3D_SIZE 无效');
  }
  if (data.length !== size * size * size * 3) {
    throw new Error('LUT 数据长度与 LUT_3D_SIZE 不匹配');
  }

  return {
    id,
    name: title,
    size,
    domainMin,
    domainMax,
    data,
  };
};

export const serializeCubeLut = (lut: Lut3D): string => {
  const lines: string[] = [];
  lines.push(`TITLE "${lut.name}"`);
  lines.push(`LUT_3D_SIZE ${lut.size}`);
  lines.push(`DOMAIN_MIN ${lut.domainMin.join(' ')}`);
  lines.push(`DOMAIN_MAX ${lut.domainMax.join(' ')}`);

  for (let i = 0; i < lut.data.length; i += 3) {
    lines.push(`${lut.data[i]} ${lut.data[i + 1]} ${lut.data[i + 2]}`);
  }

  return `${lines.join('\n')}\n`;
};

