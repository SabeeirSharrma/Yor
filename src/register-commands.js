import { registerDiscordCommands } from './discord.js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const clientId = requiredEnv('DISCORD_CLIENT_ID');
const token = requiredEnv('DISCORD_TOKEN');
const guildId = process.env.DISCORD_GUILD_ID || '';

await registerDiscordCommands({
  clientId,
  guildId,
  token,
});

console.log(`Registered Yor commands ${guildId ? `in guild ${guildId}` : 'globally'}.`);
