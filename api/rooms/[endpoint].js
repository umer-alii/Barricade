/**
 * Single Vercel serverless function for all /api/rooms/* endpoints.
 * Hobby plan allows max 12 functions — this keeps the whole room API in one.
 */
import { jsonResponse, handleCors } from '../_lib/roomUtils.js';
import handleCreate from '../_lib/handlers/create.js';
import handleJoin from '../_lib/handlers/join.js';
import handleAction from '../_lib/handlers/action.js';
import handlePoll from '../_lib/handlers/poll.js';
import handleList from '../_lib/handlers/list.js';
import handleInfo from '../_lib/handlers/info.js';
import handleDelete from '../_lib/handlers/delete.js';
import handleConfig from '../_lib/handlers/config.js';

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

  const endpoint = req.query.endpoint;
  const route = routes[endpoint];

  if (!route) {
    return jsonResponse(res, 404, { error: 'Unknown rooms endpoint' });
  }

  return route(req, res);
}
