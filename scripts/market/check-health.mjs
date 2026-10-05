export function validateHealth(status, health, now = Date.now()) {
  if (status !== 200 || health?.status !== 'ok' || !Number.isSafeInteger(health.checkedAt) ||
    health.checkedAt > now + 60000 || now - health.checkedAt > 15 * 60000 ||
    !Array.isArray(health.issues) || health.issues.length) throw Error('Active market health failed: ' +
      (Array.isArray(health?.issues) ? health.issues.map(issue => String(issue.source) + ':' + String(issue.code)).join(', ') : 'invalid response'));
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const response = await fetch('https://joinfloat.xyz/api/health', {signal:AbortSignal.timeout(20000), cache:'no-store'});
  const health = await response.json();
  validateHealth(response.status, health);
  console.log('Scheduled collection and publication checks passed.');
  for (const warning of health.warnings ?? []) console.log('Provider data warning: ' + warning.source + ':' + warning.code + ' (' + warning.affected + ' tokens).');
}
