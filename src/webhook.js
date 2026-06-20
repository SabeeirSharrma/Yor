import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEventRepository } from './github.js';
import { sendRepositoryUpdate } from './discord.js';

function parseSignatureHeader(signature) {
  if (!signature || !signature.startsWith('sha256=')) {
    return null;
  }

  return signature.slice('sha256='.length);
}

function verifyGitHubSignature(secret, body, signatureHeader) {
  if (!secret) {
    return true;
  }

  const provided = parseSignatureHeader(signatureHeader);
  if (!provided) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(provided, 'hex');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function startWebhookServer({ client, store, port, githubWebhookSecret }) {
  return Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/health') {
        return Response.json({
          ok: true,
          subscriptions: store.totalSubscriptions(),
        });
      }

      if (request.method !== 'POST' || url.pathname !== '/github/webhook') {
        return new Response('Not found', { status: 404 });
      }

      const body = await request.text();
      const eventName = request.headers.get('x-github-event');
      const deliveryId = request.headers.get('x-github-delivery');
      const signature = request.headers.get('x-hub-signature-256');

      if (!verifyGitHubSignature(githubWebhookSecret, body, signature)) {
        return new Response('Invalid signature', { status: 401 });
      }

      if (!eventName) {
        return new Response('Missing x-github-event header', { status: 400 });
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }

      const repository = getEventRepository(payload);
      if (!repository) {
        return Response.json({ ok: true, skipped: true });
      }

      void sendRepositoryUpdate(client, store, eventName, payload, deliveryId).catch((error) => {
        console.error(`Webhook processing failed for ${repository} (${eventName})`, error);
      });

      return Response.json({ ok: true });
    },
  });
}
