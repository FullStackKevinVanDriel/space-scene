const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// In-memory state
let state = {
  speed: 1,
  direction: "cw"
};

// API endpoints
app.get('/api/state', (req, res) => {
  res.json(state);
});

app.post('/api/update', (req, res) => {
  const { speed, direction } = req.body;
  if (typeof speed === 'number' && speed >= 0) {
    state.speed = speed;
  }
  if (direction === 'cw' || direction === 'ccw') {
    state.direction = direction;
  }
  res.json(state);
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
