import process from 'node:process';
import { createDiscordClient, connectDiscordClient, registerDiscordCommands } from './discord.js';
import { Store } from './store.js';
import { startWebhookServer } from './webhook.js';

function env(name, fallback = undefined) {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const discordToken = requiredEnv('DISCORD_TOKEN');
const discordClientId = requiredEnv('DISCORD_CLIENT_ID');
const githubToken = env('GITHUB_TOKEN', '');
const githubWebhookSecret = env('GITHUB_WEBHOOK_SECRET', '');
const port = Number(env('PORT', '3000'));
const sqlitePath = env('SQLITE_PATH', './data/yor.sqlite');
const discordGuildId = env('DISCORD_GUILD_ID', '');

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const store = new Store(sqlitePath);
const client = createDiscordClient({
  store,
  githubToken,
});

try {
  await registerDiscordCommands({
    clientId: discordClientId,
    guildId: discordGuildId,
    token: discordToken,
  });
  console.log('Discord commands registered.');
} catch (error) {
  console.error('Failed to register Discord commands:', error);
}

const server = startWebhookServer({
  client,
  store,
  port,
  githubWebhookSecret,
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

await connectDiscordClient(client, discordToken);

console.log(`Webhook server listening on port ${port}`);

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down.`);
  server.stop(true);
  store.close();
  await client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
