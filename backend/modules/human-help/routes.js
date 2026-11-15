import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { authenticatedLearner } from '../../middleware/learner.js';
import { readJson, HttpError, json } from '../../middleware/http.js';

export const sessionsPath = '/api/help/sessions';
export const ticketPath = /^\/api\/help\/sessions\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;

export async function helpRoute(req, res, config, ticketId) {
  const unavailable = 'Human Help is unavailable for this session.';
  if (!ticketId) {
    const body = await readJson(req, 256);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
      throw new HttpError(400, 'Send an empty help request.');
    }
  }
  if (!config?.database || !isAbsolute(config.database)) throw new HttpError(503, unavailable);
  const subject = authenticatedLearner(req.headers, config.gatewayKey);
  let db, ticket;
  try {
    // Lazy loading keeps the learning routes independent of SQLite availability.
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(config.database);
    db.exec('PRAGMA busy_timeout = 250');
    // Use the original FastAPI schema and its one-open-ticket constraint.
    db.exec(`CREATE TABLE IF NOT EXISTS tickets (ticket_id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE UNIQUE INDEX IF NOT EXISTS open_ticket ON tickets(user_id) WHERE status='open';`);
    if (ticketId) {
      ticket = db.prepare('SELECT ticket_id,status FROM tickets WHERE user_id=? AND ticket_id=?').get(subject, ticketId);
    } else {
      db.exec('BEGIN IMMEDIATE');
      db.prepare("INSERT INTO tickets(ticket_id,user_id) VALUES (?,?) ON CONFLICT(user_id) WHERE status='open' DO NOTHING")
        .run(randomUUID(), subject);
      ticket = db.prepare("SELECT ticket_id,status FROM tickets WHERE user_id=? AND status='open'").get(subject);
      db.exec('COMMIT');
    }
  } catch {
    throw new HttpError(503, unavailable);
  } finally {
    db?.close();
  }
  if (!ticket) throw new HttpError(404, 'Session not found.');
  const status = ticket.status === 'open' ? 'pending' : ticket.status;
  if (!['pending', 'active', 'resolved'].includes(status)) throw new HttpError(503, unavailable);
  json(res, ticketId ? 200 : 201, { sessionId: ticket.ticket_id, status });
}
