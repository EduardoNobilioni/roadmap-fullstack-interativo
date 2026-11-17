/**
 * Compartilha a configuração da trilha no hash da URL.
 * Não inclui progresso, anotações nem observações.
 */

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePlan(plan) {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  try {
    return bytesToBase64Url(await gzipBytes(bytes));
  } catch {
    return `raw.${bytesToBase64Url(bytes)}`;
  }
}

export async function decodePlan(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Link vazio.');
  }
  const raw = token.startsWith('raw.');
  const bytes = base64UrlToBytes(raw ? token.slice(4) : token);
  const jsonBytes = raw ? bytes : await gunzipBytes(bytes);
  const plan = JSON.parse(new TextDecoder().decode(jsonBytes));
  if (!plan || plan.v !== 1 || typeof plan.t !== 'string') {
    throw new Error('Plano compartilhado inválido.');
  }
  return plan;
}

export function planFromHash(hash) {
  const text = typeof hash === 'string' ? hash : '';
  const match = text.match(/(?:^#|[?&])plano=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
