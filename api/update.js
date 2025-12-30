// Import shared state from state.js
import { state } from './state.js';

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { speed, direction } = req.body;

  // Validate speed
  if (speed !== undefined) {
    if (typeof speed !== 'number' || speed < 0) {
      return res.status(400).json({ error: 'Speed must be a non-negative number' });
    }
    state.speed = speed;
  }

  // Validate direction
  if (direction !== undefined) {
    if (direction !== 'cw' && direction !== 'ccw') {
      return res.status(400).json({ error: 'Direction must be "cw" or "ccw"' });
    }
    state.direction = direction;
  }

  return res.status(200).json({
    speed: state.speed,
    direction: state.direction
  });
}
