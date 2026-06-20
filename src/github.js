const GITHUB_API = 'https://api.github.com';

export function normalizeRepository(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Repository is required.');
  }

  const trimmed = input.trim();
  const stripped = trimmed
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/g, '');

  const match = stripped.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error('Repository must be in owner/repo format.');
  }

  const owner = match[1].toLowerCase();
  const repo = match[2].toLowerCase();
  return `${owner}/${repo}`;
}

function githubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Yor Discord Bot',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function verifyRepositoryExists(repository, token) {
  const response = await fetch(`${GITHUB_API}/repos/${repository}`, {
    headers: githubHeaders(token),
  });

  if (response.ok) {
    return response.json();
  }

  if (response.status === 404) {
    throw new Error(`Repository not found: ${repository}`);
  }

  throw new Error(`GitHub lookup failed for ${repository} (${response.status})`);
}

export function getEventRepository(payload) {
  return payload?.repository?.full_name?.toLowerCase() ?? null;
}

function shorten(text, max = 220) {
  if (!text) {
    return '';
  }

  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max - 1)}…`;
}

function issueLikeTitle(payload, label) {
  const number = payload?.number ?? payload?.issue?.number ?? payload?.pull_request?.number ?? '?';
  const title = payload?.title ?? payload?.issue?.title ?? payload?.pull_request?.title ?? 'Untitled';
  return `${label} #${number}: ${title}`;
}

function activityLine(action, actor) {
  return `${action} by ${actor}`;
}

export function formatGitHubEvent(eventName, payload) {
  const repo = payload?.repository?.full_name ?? 'unknown/repo';
  const actor = payload?.sender?.login ?? payload?.actor?.login ?? 'someone';
  const url =
    payload?.html_url ??
    payload?.issue?.html_url ??
    payload?.pull_request?.html_url ??
    payload?.release?.html_url ??
    payload?.discussion?.html_url ??
    payload?.comment?.html_url ??
    payload?.head_commit?.url ??
    `https://github.com/${repo}`;

  let title = `${repo} • ${eventName}`;
  let description = activityLine('updated', actor);
  let color = 0x24292f;

  switch (eventName) {
    case 'issues': {
      const issue = payload.issue;
      const action = payload.action ?? 'updated';
      title = `${repo} • issue ${action} #${issue?.number ?? '?'}`;
      description = [
        activityLine(action, actor),
        issue?.title ? `Title: ${shorten(issue.title)}` : null,
        issue?.body ? `Body: ${shorten(issue.body)}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      color = action === 'closed' ? 0xd73a49 : 0x1f883d;
      break;
    }

    case 'issue_comment': {
      const issue = payload.issue;
      const action = payload.action ?? 'created';
      const scope = issue?.pull_request ? 'pull request' : 'issue';
      title = `${repo} • ${scope} comment ${action} #${issue?.number ?? '?'}`;
      description = [
        activityLine(action, actor),
        issue?.title ? `Title: ${shorten(issue.title)}` : null,
        payload.comment?.body ? `Comment: ${shorten(payload.comment.body)}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      color = 0x0969da;
      break;
    }

    case 'pull_request': {
      const pullRequest = payload.pull_request;
      const action = payload.action ?? 'updated';
      const merged = pullRequest?.merged ? 'merged' : null;
      title = `${repo} • pull request ${action} #${pullRequest?.number ?? '?'}`;
      description = [
        activityLine(action, actor),
        merged ? `State: ${merged}` : null,
        pullRequest?.title ? `Title: ${shorten(pullRequest.title)}` : null,
        pullRequest?.body ? `Body: ${shorten(pullRequest.body)}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      color = pullRequest?.merged ? 0xa371f7 : action === 'closed' ? 0xd73a49 : 0x0969da;
      break;
    }

    case 'pull_request_review': {
      const pullRequest = payload.pull_request;
      const action = payload.action ?? 'submitted';
      title = `${repo} • pull request review ${action} #${pullRequest?.number ?? '?'}`;
      description = [
        activityLine(action, actor),
        payload.review?.body ? `Review: ${shorten(payload.review.body)}` : null,
        pullRequest?.title ? `Title: ${shorten(pullRequest.title)}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      color = 0x0969da;
      break;
    }

    case 'pull_request_review_comment': {
      const pullRequest = payload.pull_request;
      const action = payload.action ?? 'created';
      title = `${repo} • pull request review comment ${action} #${pullRequest?.number ?? '?'}`;
      description = [
        activityLine(action, actor),
        payload.comment?.body ? `Comment: ${shorten(payload.comment.body)}` : null,
        pullRequest?.title ? `Title: ${shorten(pullRequest.title)}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      color = 0x0969da;
      break;
    }

    case 'release': {
      const release = payload.release;
      const action = payload.action ?? 'published';
      title = `${repo} • release ${action}: ${release?.tag_name ?? 'untagged'}`;
      description = [
        activityLine(action, actor),
        release?.name ? `Name: ${shorten(release.name)}` : null,
        release?.body ? `Notes: ${shorten(release.body)}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      color = 0x8250df;
      break;
    }

    case 'discussion':
    case 'discussion_comment': {
      const action = payload.action ?? 'updated';
      const discussion = payload.discussion;
      const item = eventName === 'discussion_comment' ? 'discussion comment' : 'discussion';
      title = `${repo} • ${item} ${action} #${discussion?.number ?? '?'}`;
      description = [
        activityLine(action, actor),
        discussion?.title ? `Title: ${shorten(discussion.title)}` : null,
        payload.comment?.body ? `Comment: ${shorten(payload.comment.body)}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      color = 0x1f883d;
      break;
    }

    case 'push': {
      const commits = Array.isArray(payload.commits) ? payload.commits : [];
      const branch = String(payload.ref ?? '').replace('refs/heads/', '') || 'unknown';
      title = `${repo} • push to ${branch}`;
      description = [
        activityLine(`pushed ${commits.length} commit${commits.length === 1 ? '' : 's'}`, actor),
        payload.head_commit?.message ? `Latest commit: ${shorten(payload.head_commit.message)}` : null,
        payload.compare ? `Compare: ${payload.compare}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      color = 0x1f883d;
      break;
    }

    default: {
      const action = payload?.action ? `${payload.action} ` : '';
      title = `${repo} • ${eventName} ${action}`.trim();
      description = shorten(JSON.stringify(payload?.sender ?? payload?.action ?? 'event'));
      color = 0x6e7781;
      break;
    }
  }

  return {
    title: shorten(title, 240),
    description: description || `Event received from ${repo}.`,
    url,
    color,
    repo,
    actor,
    eventName,
  };
}
