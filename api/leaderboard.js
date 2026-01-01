// Vercel Serverless Function for Leaderboard
// Uses Vercel KV (Redis) for persistent storage

// In-memory fallback if KV is not configured (for development)
let memoryLeaderboard = [];

// Helper to get KV client (if available)
async function getKV() {
    try {
        const { kv } = await import('@vercel/kv');
        return kv;
    } catch (e) {
        return null;
    }
}

// Get leaderboard from storage
async function getLeaderboard() {
    const kv = await getKV();
    if (kv) {
        try {
            const data = await kv.get('leaderboard');
            return data || [];
        } catch (e) {
            console.error('KV get error:', e);
            return memoryLeaderboard;
        }
    }
    return memoryLeaderboard;
}

// Save leaderboard to storage
async function saveLeaderboard(leaderboard) {
    const kv = await getKV();
    if (kv) {
        try {
            await kv.set('leaderboard', leaderboard);
        } catch (e) {
            console.error('KV set error:', e);
            memoryLeaderboard = leaderboard;
        }
    } else {
        memoryLeaderboard = leaderboard;
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET - Retrieve leaderboard
    if (req.method === 'GET') {
        const leaderboard = await getLeaderboard();
        return res.status(200).json({
            success: true,
            leaderboard: leaderboard.slice(0, 10) // Top 10 only
        });
    }

    // POST - Submit a new score
    if (req.method === 'POST') {
        try {
            const { name, score, time, location } = req.body;

            if (typeof score !== 'number' || score < 0) {
                return res.status(400).json({ success: false, error: 'Invalid score' });
            }

            if (typeof time !== 'number' || time < 0) {
                return res.status(400).json({ success: false, error: 'Invalid time' });
            }

            // Create entry
            const entry = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                name: name?.trim()?.substring(0, 20) || 'Anonymous',
                score: Math.floor(score),
                time: Math.floor(time), // Time in seconds
                location: location?.trim()?.substring(0, 50) || 'Unknown',
                date: new Date().toISOString()
            };

            // Get current leaderboard
            let leaderboard = await getLeaderboard();

            // Check if score qualifies for leaderboard
            const minScore = leaderboard.length >= 10 ? leaderboard[9].score : 0;
            if (leaderboard.length >= 10 && score <= minScore) {
                return res.status(200).json({
                    success: true,
                    qualified: false,
                    message: 'Score does not qualify for top 10',
                    minScore: minScore
                });
            }

            // Add entry and sort by score (descending)
            leaderboard.push(entry);
            leaderboard.sort((a, b) => b.score - a.score);

            // Keep only top 10
            leaderboard = leaderboard.slice(0, 10);

            // Save updated leaderboard
            await saveLeaderboard(leaderboard);

            // Find rank
            const rank = leaderboard.findIndex(e => e.id === entry.id) + 1;

            return res.status(200).json({
                success: true,
                qualified: true,
                rank: rank,
                entry: entry,
                leaderboard: leaderboard
            });

        } catch (error) {
            console.error('Leaderboard POST error:', error);
            return res.status(500).json({ success: false, error: 'Server error' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
