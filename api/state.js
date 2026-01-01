let state = {
  speed: 1,
  direction: 'cw'
};

export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json(state);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
