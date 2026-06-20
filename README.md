# Yor

Yor is a Discord bot written in JavaScript for tracking GitHub repositories and forwarding updates to Discord DMs or channels.

## Features

- Track repository activity from GitHub
- Deliver updates to user DMs
- Deliver updates to a Discord channel
- Accept slash commands in DMs and in guilds
- Store subscriptions in SQLite
- Verify GitHub webhook signatures when configured

## Requirements

- Bun
- A Discord application bot token
- A Discord application client ID
- A GitHub webhook secret is recommended

## Setup

1. Install Bun.
2. Install dependencies:

```bash
bun install
```

3. Copy `.env.example` to `.env` and fill in the values.
4. Start the bot:

```bash
bun run dev
```

The bot registers its slash commands automatically during startup. The `register` script remains as a manual fallback if you want to refresh commands without running the full bot.

## Environment

- `DISCORD_TOKEN`: Discord bot token
- `DISCORD_CLIENT_ID`: Discord application client ID
- `DISCORD_GUILD_ID`: optional guild ID for fast command registration during development
- `GITHUB_TOKEN`: optional GitHub token for repository validation
- `GITHUB_WEBHOOK_SECRET`: optional webhook signature secret
- `PORT`: webhook server port, default `3000`
- `BASE_URL`: base URL for your deployment, used in documentation
- `SQLITE_PATH`: path to the SQLite database file

## Webhook

Create a GitHub webhook for each repository you want to monitor and point it at:

```text
POST /github/webhook
```

Example local URL:

```text
http://localhost:3000/github/webhook
```

Supported webhook events include:

- `issues`
- `issue_comment`
- `pull_request`
- `pull_request_review`
- `pull_request_review_comment`
- `release`
- `discussion`
- `discussion_comment`
- `push`

## Commands

Use these in DMs or in a guild:

- `/yor watch me repository:owner/repo`
- `/yor watch user repository:owner/repo target:@user`
- `/yor watch channel repository:owner/repo`
- `/yor watch many repositories:owner/a, owner/b, owner/c`
- `/yor unwatch me repository:owner/repo`
- `/yor unwatch user repository:owner/repo target:@user`
- `/yor unwatch channel repository:owner/repo`
- `/yor unwatch many repositories:owner/a, owner/b, owner/c`
- `/yor watches`
- `/yor health`

Batch commands accept comma-, space-, or newline-separated repositories and handle up to 25 repositories per request.

## Notes

- `/yor watch channel` and `/yor unwatch channel` require a guild context.
- `/yor watch user` and `/yor unwatch user` require Manage Server or Manage Channels permissions.
- If a user has DMs closed, DM delivery will fail for that user and the bot will log the error.
