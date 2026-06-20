import { EmbedBuilder } from 'discord.js';
import { formatGitHubEvent, getEventRepository } from './github.js';

async function sendToUser(client, userId, payload) {
  const user = await client.users.fetch(userId);
  return user.send(payload);
}

async function sendToChannel(client, channelId, payload) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Channel ${channelId} is not text-based.`);
  }

  return channel.send(payload);
}

export async function dispatchRepositoryUpdate({ client, store, eventName, payload, deliveryId }) {
  const repository = getEventRepository(payload);
  if (!repository) {
    return { delivered: 0, skipped: true };
  }

  if (deliveryId && store.hasProcessedEvent(deliveryId)) {
    return { delivered: 0, skipped: true };
  }

  if (deliveryId) {
    store.markProcessedEvent({
      deliveryId,
      repo: repository,
      eventName,
    });
  }

  const subscriptions = store.listSubscriptionsForRepo(repository);
  if (subscriptions.length === 0) {
    return { delivered: 0, skipped: false };
  }

  const event = formatGitHubEvent(eventName, payload);
  const embed = new EmbedBuilder()
    .setTitle(event.title)
    .setURL(event.url)
    .setDescription(event.description)
    .setColor(event.color)
    .setFooter({ text: `GitHub ${event.eventName}` });

  const message = {
    content: `Update for \`${repository}\``,
    embeds: [embed],
    allowedMentions: { parse: [] },
  };

  const results = await Promise.allSettled(
    subscriptions.map((subscription) => {
      if (subscription.destination_type === 'user') {
        return sendToUser(client, subscription.destination_id, message);
      }

      if (subscription.destination_type === 'channel') {
        return sendToChannel(client, subscription.destination_id, message);
      }

      throw new Error(`Unsupported destination type: ${subscription.destination_type}`);
    }),
  );

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    const reasons = failures.map((failure) => failure.reason?.message ?? String(failure.reason));
    console.error(`Failed to deliver ${eventName} for ${repository}:`, reasons);
  }

  return {
    delivered: results.length - failures.length,
    failed: failures.length,
    skipped: false,
  };
}
