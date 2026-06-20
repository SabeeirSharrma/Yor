import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
} from 'discord.js';
import { buildCommandPayloads } from './commands.js';
import { normalizeRepository, verifyRepositoryExists } from './github.js';
import { dispatchRepositoryUpdate } from './notify.js';

function isManageAllowed(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator),
  );
}

async function reply(interaction, content, options = {}) {
  const payload =
    typeof content === 'string'
      ? { content }
      : {
          ...content,
        };

  payload.allowedMentions = { parse: [] };
  const ephemeral = interaction.guildId ? options.ephemeral ?? true : undefined;

  if (ephemeral !== undefined && !interaction.deferred && !interaction.replied) {
    payload.ephemeral = ephemeral;
  }

  if (interaction.deferred || interaction.replied) {
    delete payload.ephemeral;
    return interaction.editReply(payload);
  }

  return interaction.reply(payload);
}

function parseRepositoryList(input) {
  return [...new Set(input.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean))];
}

function destinationForInteraction(interaction, destinationType, targetUser) {
  if (destinationType === 'channel') {
    if (!interaction.guildId) {
      throw new Error('Channel subscriptions can only be created in a server channel.');
    }

    return {
      destinationType: 'channel',
      destinationId: interaction.channelId,
    };
  }

  if (destinationType === 'user') {
    if (!targetUser) {
      throw new Error('A target user is required.');
    }

    return {
      destinationType: 'user',
      destinationId: targetUser.id,
    };
  }

  return {
    destinationType: 'user',
    destinationId: interaction.user.id,
  };
}

function resolveBulkDestination(interaction, targetUser) {
  if (targetUser) {
    return {
      destinationType: 'user',
      destinationId: targetUser.id,
    };
  }

  if (interaction.guildId) {
    return {
      destinationType: 'channel',
      destinationId: interaction.channelId,
    };
  }

  return {
    destinationType: 'user',
    destinationId: interaction.user.id,
  };
}

function destinationLabel(destination) {
  return destination.destinationType === 'channel'
    ? `<#${destination.destinationId}>`
    : `<@${destination.destinationId}>`;
}

function ensureBatchPermission(interaction, destination, targetUser) {
  if (destination.destinationType === 'channel' && !isManageAllowed(interaction)) {
    throw new Error('You need Manage Server or Manage Channels permission to configure channel subscriptions.');
  }

  if (
    destination.destinationType === 'user' &&
    targetUser &&
    targetUser.id !== interaction.user.id &&
    !isManageAllowed(interaction)
  ) {
    throw new Error('You need Manage Server or Manage Channels permission to subscribe another user.');
  }
}

function summarizeBatch(action, repositoryResults, destination) {
  const created = repositoryResults.filter((result) => result.status === 'added').length;
  const unchanged = repositoryResults.filter((result) => result.status === 'exists').length;
  const removed = repositoryResults.filter((result) => result.status === 'removed').length;
  const missing = repositoryResults.filter((result) => result.status === 'missing').length;
  const failed = repositoryResults.filter((result) => result.status === 'failed').length;

  const lines = [
    `${action} for ${destinationLabel(destination)}.`,
    `Added: ${created} | Already present: ${unchanged} | Removed: ${removed} | Missing: ${missing} | Failed: ${failed}`,
  ];

  const details = repositoryResults.map((result) => {
    if (result.status === 'failed') {
      return `- ${result.input}: ${result.error}`;
    }

    return `- ${result.repo}: ${result.status}`;
  });

  const detailLimit = 12;
  lines.push(...details.slice(0, detailLimit));
  if (details.length > detailLimit) {
    lines.push(`... and ${details.length - detailLimit} more`);
  }

  return lines.join('\n');
}

async function handleWatch(interaction, store, destinationType, targetUser) {
  const repository = normalizeRepository(interaction.options.getString('repository', true));
  const destination = destinationForInteraction(interaction, destinationType, targetUser);

  if (destinationType !== 'user' && !isManageAllowed(interaction)) {
    throw new Error('You need Manage Server or Manage Channels permission to configure channel subscriptions.');
  }

  if (destinationType === 'user' && targetUser?.id !== interaction.user.id && !isManageAllowed(interaction)) {
    throw new Error('You need Manage Server or Manage Channels permission to subscribe another user.');
  }

  await verifyRepositoryExists(repository, interaction.client.githubToken);

  const created = store.addSubscription({
    repo: repository,
    destinationType: destination.destinationType,
    destinationId: destination.destinationId,
  });

  const targetLabel =
    destination.destinationType === 'channel'
      ? `<#${destination.destinationId}>`
      : `<@${destination.destinationId}>`;

  return reply(
    interaction,
    created
      ? `Now tracking \`${repository}\` for ${targetLabel}.`
      : `\`${repository}\` was already being tracked for ${targetLabel}.`,
  );
}

async function handleUnwatch(interaction, store, destinationType, targetUser) {
  const repository = normalizeRepository(interaction.options.getString('repository', true));
  const destination = destinationForInteraction(interaction, destinationType, targetUser);

  if (destinationType !== 'user' && !isManageAllowed(interaction)) {
    throw new Error('You need Manage Server or Manage Channels permission to remove a channel subscription.');
  }

  if (destinationType === 'user' && targetUser?.id !== interaction.user.id && !isManageAllowed(interaction)) {
    throw new Error('You need Manage Server or Manage Channels permission to remove another user.');
  }

  const removed = store.removeSubscription({
    repo: repository,
    destinationType: destination.destinationType,
    destinationId: destination.destinationId,
  });

  const targetLabel =
    destination.destinationType === 'channel'
      ? `<#${destination.destinationId}>`
      : `<@${destination.destinationId}>`;

  return reply(
    interaction,
    removed
      ? `Stopped tracking \`${repository}\` for ${targetLabel}.`
      : `No subscription found for \`${repository}\` and ${targetLabel}.`,
  );
}

async function handleBulkWatch(interaction, store, targetUser) {
  const repositoryInputs = parseRepositoryList(interaction.options.getString('repositories', true));
  if (repositoryInputs.length === 0) {
    throw new Error('Provide at least one repository.');
  }

  if (repositoryInputs.length > 25) {
    throw new Error('You can manage at most 25 repositories per batch command.');
  }

  const destination = resolveBulkDestination(interaction, targetUser);
  ensureBatchPermission(interaction, destination, targetUser);

  const results = [];
  for (const input of repositoryInputs) {
    try {
      const repo = normalizeRepository(input);
      await verifyRepositoryExists(repo, interaction.client.githubToken);
      const created = store.addSubscription({
        repo,
        destinationType: destination.destinationType,
        destinationId: destination.destinationId,
      });

      results.push({
        input,
        repo,
        status: created ? 'added' : 'exists',
      });
    } catch (error) {
      results.push({
        input,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return reply(interaction, summarizeBatch('Watch batch complete', results, destination));
}

async function handleBulkUnwatch(interaction, store, targetUser) {
  const repositoryInputs = parseRepositoryList(interaction.options.getString('repositories', true));
  if (repositoryInputs.length === 0) {
    throw new Error('Provide at least one repository.');
  }

  if (repositoryInputs.length > 25) {
    throw new Error('You can manage at most 25 repositories per batch command.');
  }

  const destination = resolveBulkDestination(interaction, targetUser);
  ensureBatchPermission(interaction, destination, targetUser);

  const results = [];
  for (const input of repositoryInputs) {
    try {
      const repo = normalizeRepository(input);
      const removed = store.removeSubscription({
        repo,
        destinationType: destination.destinationType,
        destinationId: destination.destinationId,
      });

      results.push({
        input,
        repo,
        status: removed ? 'removed' : 'missing',
      });
    } catch (error) {
      results.push({
        input,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return reply(interaction, summarizeBatch('Unwatch batch complete', results, destination));
}

function buildWatchesMessage(interaction, store) {
  const userSubscriptions = store.listSubscriptionsForDestination('user', interaction.user.id);
  const channelSubscriptions = interaction.channelId
    ? store.listSubscriptionsForDestination('channel', interaction.channelId)
    : [];

  const lines = [];
  lines.push(`Your DM subscriptions: ${userSubscriptions.length || 0}`);
  if (userSubscriptions.length > 0) {
    for (const subscription of userSubscriptions) {
      lines.push(`- ${subscription.repo}`);
    }
  }

  if (interaction.channelId) {
    lines.push(`This channel subscriptions: ${channelSubscriptions.length || 0}`);
    if (channelSubscriptions.length > 0) {
      for (const subscription of channelSubscriptions) {
        lines.push(`- ${subscription.repo}`);
      }
    }
  }

  if (lines.length === 1) {
    lines.push('No subscriptions found.');
  }

  return lines.join('\n');
}

export function createDiscordClient({ store, githubToken }) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.githubToken = githubToken;
  client.store = store;

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName !== 'yor') {
      return;
    }

    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(false);

    try {
      if (group === 'watch' && subcommand === 'me') {
        await handleWatch(interaction, store, 'user', interaction.user);
        return;
      }

      if (group === 'watch' && subcommand === 'user') {
        const target = interaction.options.getUser('target', true);
        await handleWatch(interaction, store, 'user', target);
        return;
      }

      if (group === 'watch' && subcommand === 'channel') {
        await handleWatch(interaction, store, 'channel');
        return;
      }

      if (group === 'watch' && subcommand === 'many') {
        const target = interaction.options.getUser('target', false);
        await handleBulkWatch(interaction, store, target ?? undefined);
        return;
      }

      if (group === 'unwatch' && subcommand === 'me') {
        await handleUnwatch(interaction, store, 'user', interaction.user);
        return;
      }

      if (group === 'unwatch' && subcommand === 'user') {
        const target = interaction.options.getUser('target', true);
        await handleUnwatch(interaction, store, 'user', target);
        return;
      }

      if (group === 'unwatch' && subcommand === 'channel') {
        await handleUnwatch(interaction, store, 'channel');
        return;
      }

      if (group === 'unwatch' && subcommand === 'many') {
        const target = interaction.options.getUser('target', false);
        await handleBulkUnwatch(interaction, store, target ?? undefined);
        return;
      }

      if (subcommand === 'watches') {
        await reply(interaction, buildWatchesMessage(interaction, store));
        return;
      }

      if (subcommand === 'health') {
        const total = store.totalSubscriptions();
        const embed = new EmbedBuilder()
          .setTitle('Yor health')
          .setDescription(`Subscriptions: ${total}`)
          .setColor(0x1f883d);

        await reply(interaction, { embeds: [embed] });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reply(interaction, `Error: ${message}`);
    }
  });

  return client;
}

export async function registerDiscordCommands({ clientId, guildId, token }) {
  const rest = new REST({ version: '10' }).setToken(token);
  const payload = buildCommandPayloads();

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: payload });
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: payload });
}

export async function connectDiscordClient(client, token) {
  return client.login(token);
}

export async function sendRepositoryUpdate(client, store, eventName, payload, deliveryId) {
  return dispatchRepositoryUpdate({ client, store, eventName, payload, deliveryId });
}
