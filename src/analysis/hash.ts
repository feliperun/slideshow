import sharp from 'sharp';

export const perceptualHash = async (input: string | Buffer): Promise<string> => {
  const { data } = await sharp(input)
    .resize(8, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const average = [...data].reduce((sum, value) => sum + value, 0) / data.length;
  let binary = '';
  for (const value of data) binary += value >= average ? '1' : '0';
  return BigInt(`0b${binary}`).toString(16).padStart(16, '0');
};

export const hammingDistance = (left: string, right: string): number => {
  let xor = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (xor > 0) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
};
