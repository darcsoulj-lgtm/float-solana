export function validateHealth(status, health, now = Date.now()) {
  if (status !== 200 || health?.status !== 'ok' || !Number.isSafeInteger(health.checkedAt) ||
    health.checkedAt > now + 60000 || now - health.checkedAt > 15 * 60000 ||
    !Array.isArray(health.issues) || health.issues.length) throw Error('Active market health failed: ' +
      (Array.isArray(health?.issues) ? health.issues.map(issue => String(issue.source) + ':' + String(issue.code)).join(', ') : 'invalid response'));
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const response = await fetch('https://joinfloat.xyz/api/health', {signal:AbortSignal.timeout(20000), cache:'no-store'});
  validateHealth(response.status, await response.json());
  console.log('Active market sources and publication are healthy.');
}
