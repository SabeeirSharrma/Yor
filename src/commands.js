import { SlashCommandBuilder } from 'discord.js';

export function buildCommandPayloads() {
  return [
    new SlashCommandBuilder()
      .setName('yor')
      .setDescription('Manage GitHub repository subscriptions.')
      .setDMPermission(true)
      .addSubcommandGroup((group) =>
        group
          .setName('watch')
          .setDescription('Add a repository subscription.')
          .addSubcommand((subcommand) =>
            subcommand
              .setName('me')
              .setDescription('Send repository updates to your DMs.')
              .addStringOption((option) =>
                option
                  .setName('repository')
                  .setDescription('Repository in owner/repo form.')
                  .setRequired(true),
              ),
          )
          .addSubcommand((subcommand) =>
            subcommand
              .setName('user')
              .setDescription("Send repository updates to another user's DMs.")
              .addStringOption((option) =>
                option
                  .setName('repository')
                  .setDescription('Repository in owner/repo form.')
                  .setRequired(true),
              )
              .addUserOption((option) =>
                option
                  .setName('target')
                  .setDescription('User who should receive updates in DMs.')
                  .setRequired(true),
              ),
          )
          .addSubcommand((subcommand) =>
            subcommand
              .setName('many')
              .setDescription('Send updates for multiple repositories at once.')
              .addStringOption((option) =>
                option
                  .setName('repositories')
                  .setDescription('Comma, space, or newline separated owner/repo values.')
                  .setRequired(true),
              )
              .addUserOption((option) =>
                option
                  .setName('target')
                  .setDescription('User who should receive updates in DMs.')
                  .setRequired(false),
              ),
          ),
      )
      .addSubcommandGroup((group) =>
        group
          .setName('unwatch')
          .setDescription('Remove a repository subscription.')
          .addSubcommand((subcommand) =>
            subcommand
              .setName('me')
              .setDescription('Remove your DM subscription.')
              .addStringOption((option) =>
                option
                  .setName('repository')
                  .setDescription('Repository in owner/repo form.')
                  .setRequired(true),
              ),
          )
          .addSubcommand((subcommand) =>
            subcommand
              .setName('user')
              .setDescription("Remove another user's DM subscription.")
              .addStringOption((option) =>
                option
                  .setName('repository')
                  .setDescription('Repository in owner/repo form.')
                  .setRequired(true),
              )
              .addUserOption((option) =>
                option
                  .setName('target')
                  .setDescription('User whose DM subscription should be removed.')
                  .setRequired(true),
              ),
          )
          .addSubcommand((subcommand) =>
            subcommand
              .setName('many')
              .setDescription('Remove multiple repositories at once.')
              .addStringOption((option) =>
                option
                  .setName('repositories')
                  .setDescription('Comma, space, or newline separated owner/repo values.')
                  .setRequired(true),
              )
              .addUserOption((option) =>
                option
                  .setName('target')
                  .setDescription('User whose DM subscriptions should be removed.')
                  .setRequired(false),
              ),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('watches')
          .setDescription('Show your current repository subscriptions.'),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('health')
          .setDescription('Show bot health and subscription counts.'),
      )
      .toJSON(),
  ];
}
