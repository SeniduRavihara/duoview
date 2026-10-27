export function normalizeUrl(input) {
  let value = input.trim();
  if (!value) throw new Error('Enter a website address first.');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[\w.-]+:\d+(?:[/?#]|$)/.test(value)) throw new Error('Use an http:// or https:// address.');
    value = (/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(value) ? 'http://' : 'https://') + value;
  }
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS websites can be previewed.');
  if (url.username || url.password) throw new Error('Use the website’s sign-in form instead of credentials in the URL.');
  return url.href;
}
export function record(history, url, replace = false) {
  if (replace && history.index >= 0) history.entries[history.index] = url;
  else if (history.entries[history.index] !== url) {
    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(url);
    if (history.entries.length > 100) history.entries.shift();
    history.index = history.entries.length - 1;
  }
  return history;
}
export function step(history, delta) {
  const index = history.index + delta;
  if (index < 0 || index >= history.entries.length) return null;
  history.index = index;
  return history.entries[index];
}
