let state = {
  speed: 1,
  direction: 'cw'
};

export default function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { speed, direction } = req.body || {};
      if (typeof speed === 'number' && speed >= 0) state.speed = speed;
      if (direction === 'cw' || direction === 'ccw') state.direction = direction;
      return res.status(200).json(state);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
