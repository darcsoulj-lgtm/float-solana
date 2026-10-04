export function exceedsBalance(amount, available) {
  if (!/^\d+(\.\d+)?$/.test(amount) || !/^\d+(\.\d+)?$/.test(available)) return false;
  const [a, af = ''] = amount.split('.'), [b, bf = ''] = available.split('.');
  const places = Math.max(af.length, bf.length);
  return BigInt(a + af.padEnd(places, '0')) > BigInt(b + bf.padEnd(places, '0'));
}

export function formatBalance(value) {
  const [whole, fraction = ''] = value.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return BigInt(whole).toLocaleString('en-US') + (trimmed ? '.' + trimmed : '');
}
