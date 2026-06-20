import { Database } from 'bun:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export class Store {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.#prepare();
  }

  #prepare() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo TEXT NOT NULL,
        destination_type TEXT NOT NULL,
        destination_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(repo, destination_type, destination_id)
      );

      CREATE INDEX IF NOT EXISTS idx_subscriptions_repo
        ON subscriptions(repo);

      CREATE INDEX IF NOT EXISTS idx_subscriptions_destination
        ON subscriptions(destination_type, destination_id);

      CREATE TABLE IF NOT EXISTS processed_events (
        delivery_id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        event_name TEXT NOT NULL,
        received_at INTEGER NOT NULL
      );
    `);

    this.insertSubscription = this.db.prepare(`
      INSERT OR IGNORE INTO subscriptions (repo, destination_type, destination_id, created_at)
      VALUES ($repo, $destinationType, $destinationId, $createdAt)
    `);

    this.deleteSubscription = this.db.prepare(`
      DELETE FROM subscriptions
      WHERE repo = $repo
        AND destination_type = $destinationType
        AND destination_id = $destinationId
    `);

    this.listByDestination = this.db.prepare(`
      SELECT repo, destination_type, destination_id, created_at
      FROM subscriptions
      WHERE destination_type = $destinationType
        AND destination_id = $destinationId
      ORDER BY repo ASC
    `);

    this.listByRepo = this.db.prepare(`
      SELECT repo, destination_type, destination_id, created_at
      FROM subscriptions
      WHERE repo = $repo
      ORDER BY destination_type ASC, destination_id ASC
    `);

    this.countSubscriptions = this.db.prepare(`
      SELECT COUNT(*) AS total FROM subscriptions
    `);

    this.markEvent = this.db.prepare(`
      INSERT OR IGNORE INTO processed_events (delivery_id, repo, event_name, received_at)
      VALUES ($deliveryId, $repo, $eventName, $receivedAt)
    `);

    this.seenEvent = this.db.prepare(`
      SELECT 1 AS seen
      FROM processed_events
      WHERE delivery_id = $deliveryId
      LIMIT 1
    `);
  }

  addSubscription({ repo, destinationType, destinationId }) {
    const result = this.insertSubscription.run({
      repo,
      destinationType,
      destinationId,
      createdAt: Date.now(),
    });

    return result.changes > 0;
  }

  removeSubscription({ repo, destinationType, destinationId }) {
    const result = this.deleteSubscription.run({
      repo,
      destinationType,
      destinationId,
    });

    return result.changes > 0;
  }

  listSubscriptionsForDestination(destinationType, destinationId) {
    return this.listByDestination.all({
      destinationType,
      destinationId,
    });
  }

  listSubscriptionsForRepo(repo) {
    return this.listByRepo.all({ repo });
  }

  totalSubscriptions() {
    return this.countSubscriptions.get().total;
  }

  hasProcessedEvent(deliveryId) {
    return Boolean(this.seenEvent.get({ deliveryId }));
  }

  markProcessedEvent({ deliveryId, repo, eventName }) {
    this.markEvent.run({
      deliveryId,
      repo,
      eventName,
      receivedAt: Date.now(),
    });
  }

  close() {
    this.db.close();
  }
}
