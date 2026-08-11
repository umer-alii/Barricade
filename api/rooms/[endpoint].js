/**
 * Single serverless function serving every /api/rooms/* endpoint.
 *
 * All handler logic lives in top-level server/ (outside api/) so the platform
 * creates exactly one function — Vercel's Hobby plan allows at most 12.
 */
import { jsonResponse, handleCors } from '../../server/roomUtils.js';
import handleCreate from '../../server/handlers/create.js';
import handleJoin from '../../server/handlers/join.js';
import handleAction from '../../server/handlers/action.js';
import handlePoll from '../../server/handlers/poll.js';
import handleList from '../../server/handlers/list.js';
import handleInfo from '../../server/handlers/info.js';
import handleDelete from '../../server/handlers/delete.js';
import handleConfig from '../../server/handlers/config.js';

const routes = {
  create: handleCreate,
  join: handleJoin,
  action: handleAction,
  poll: handlePoll,
  list: handleList,
  info: handleInfo,
  delete: handleDelete,
  config: handleConfig
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const route = routes[req.query.endpoint];
  if (!route) {
    return jsonResponse(res, 404, { error: 'Unknown rooms endpoint' });
  }

  return route(req, res);
}
