/**
 * =============================================
 *   Express Server — Smart Traffic System API
 *   Priority-Based Traffic Management using AVL Tree
 * =============================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const AVLTree = require('./avl');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────
//  AVL TREE INSTANCES
//  One tree per lane (4 lanes) + one global
// ─────────────────────────────────────────
const laneTrees = {
    1: new AVLTree(),
    2: new AVLTree(),
    3: new AVLTree(),
    4: new AVLTree()
};

const globalTree = new AVLTree();

// Vehicle type → priority mapping (lower = higher urgency)
const PRIORITY_MAP = {
    'Ambulance': 1,
    'Fire Truck': 2,
    'Police': 3,
    'Bus': 4,
    'Car': 5,
    'Bike': 6
};

const PRIORITY_LABEL = {
    1: 'EMERGENCY',
    2: 'EMERGENCY',
    3: 'EMERGENCY',
    4: 'HIGH',
    5: 'NORMAL',
    6: 'NORMAL'
};

// Plate format: 2 letters · 2 digits · 2 letters · 4 digits
const PLATE_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;

// ─────────────────────────────────────────
//  INIT: Load waiting vehicles from DB into AVL trees on startup
// ─────────────────────────────────────────
async function initSystem() {
    try {
        await db.initDB();
        const waitingVehicles = await db.getWaitingVehicles();
        waitingVehicles.forEach(v => {
            const lane = v.lane_number;
            if (laneTrees[lane]) laneTrees[lane].insertVehicle(v);
            globalTree.insertVehicle(v);
        });
        console.log(`🔄 Restored ${waitingVehicles.length} waiting vehicles into AVL trees`);
    } catch (err) {
        console.error('❌ DB Init Error:', err.message);
        console.log('⚠️  Running with in-memory only mode (no DB persistence)');
    }
}

// ─────────────────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────────────────
app.get('/api/health', async (req, res) => {
    try {
        const dbTime = await db.ping();
        res.json({ status: 'OK', db: 'connected', time: dbTime });
    } catch (err) {
        res.json({ status: 'OK', db: 'disconnected', error: err.message, mode: 'in-memory only' });
    }
});

// ─────────────────────────────────────────
//  ADD VEHICLE — POST /api/vehicles
// ─────────────────────────────────────────
app.post('/api/vehicles', async (req, res) => {
    try {
        const { vehicle_number, vehicle_type, lane_number } = req.body;

        if (!vehicle_number || !vehicle_type || !lane_number) {
            return res.status(400).json({ error: 'Missing required fields: vehicle_number, vehicle_type, lane_number' });
        }

        // ── Plate format validation ──────────────────────────────────────────
        const cleanNum = vehicle_number.toUpperCase().trim();
        if (cleanNum.length !== 10 || !PLATE_REGEX.test(cleanNum)) {
            return res.status(400).json({
                error: `Invalid plate format. Required: 2 letters·2 digits·2 letters·4 digits (e.g. TN01AB1234). Got: "${cleanNum}"`
            });
        }

        // ── Uniqueness check against live AVL queue ──────────────────────────
        const currentQueue = globalTree.getQueue();
        const duplicate = currentQueue.find(v => v.vehicle_number === cleanNum);
        if (duplicate) {
            return res.status(409).json({
                error: `${cleanNum} is already waiting in Lane ${duplicate.lane_number}. Duplicate vehicle numbers are not allowed.`
            });
        }

        const lane = parseInt(lane_number);
        if (![1, 2, 3, 4].includes(lane)) {
            return res.status(400).json({ error: 'Lane must be 1, 2, 3, or 4' });
        }

        const priority = PRIORITY_MAP[vehicle_type];
        if (!priority) {
            return res.status(400).json({ error: `Unknown vehicle type. Valid: ${Object.keys(PRIORITY_MAP).join(', ')}` });
        }

        const vehicleData = {
            vehicle_number: cleanNum,
            vehicle_type,
            priority,
            arrival_time: new Date().toISOString(),
            lane_number: lane,
            status: 'waiting'
        };

        // Save to PostgreSQL
        let savedVehicle = vehicleData;
        let dbSaved = false;
        try {
            savedVehicle = await db.insertVehicle(vehicleData);
            dbSaved = true;
            await db.addLog(savedVehicle.id, 'VEHICLE_ADDED',
                `${vehicle_type} ${savedVehicle.vehicle_number} added to Lane ${lane} | Priority: ${priority} (${PRIORITY_LABEL[priority]})`);
        } catch (dbErr) {
            savedVehicle = { ...vehicleData, id: Date.now() };
            console.warn('DB write failed, using in-memory:', dbErr.message);
        }

        // Insert into AVL trees
        laneTrees[lane].insertVehicle(savedVehicle);
        globalTree.insertVehicle(savedVehicle);

        res.json({
            success: true,
            dbSaved,
            vehicle: savedVehicle,
            treeHeight: globalTree.getHeight(),
            treeSize: globalTree.getSize(),
            rotations: globalTree.rotationCount,
            message: `${vehicle_type} ${savedVehicle.vehicle_number} added to Lane ${lane} — Priority ${priority} (${PRIORITY_LABEL[priority]})`
        });

    } catch (err) {
        console.error('POST /api/vehicles error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  SIGNAL GREEN — DELETE /api/vehicles/remove
// ─────────────────────────────────────────
app.delete('/api/vehicles/remove', async (req, res) => {
    try {
        const { lane } = req.query;
        let removedVehicle = null;

        if (lane) {
            const laneNum = parseInt(lane);
            removedVehicle = laneTrees[laneNum]?.removeHighestPriority() || null;
            if (removedVehicle) globalTree.deleteVehicle(removedVehicle);
        } else {
            removedVehicle = globalTree.removeHighestPriority();
            if (removedVehicle) {
                const laneTree = laneTrees[removedVehicle.lane_number];
                if (laneTree) laneTree.deleteVehicle(removedVehicle);
            }
        }

        if (!removedVehicle) {
            return res.status(404).json({ error: 'No vehicles in queue' });
        }

        try {
            await db.updateVehicleStatus(removedVehicle.id, 'passed');
            await db.addLog(removedVehicle.id, 'SIGNAL_GREEN',
                `${removedVehicle.vehicle_type} ${removedVehicle.vehicle_number} PASSED — Lane ${removedVehicle.lane_number} | Priority was ${removedVehicle.priority}`);
        } catch (dbErr) {
            console.warn('DB update failed:', dbErr.message);
        }

        res.json({
            success: true,
            vehicle: removedVehicle,
            treeSize: globalTree.getSize(),
            message: `Signal Green! ${removedVehicle.vehicle_type} ${removedVehicle.vehicle_number} has passed.`
        });

    } catch (err) {
        console.error('DELETE /api/vehicles/remove error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  SEARCH VEHICLE — GET /api/vehicles/search?number=
// ─────────────────────────────────────────
app.get('/api/vehicles/search', (req, res) => {
    try {
        const { number } = req.query;
        if (!number) return res.status(400).json({ error: 'Query param ?number= required' });

        const vehicle = globalTree.search(number.toUpperCase().trim());

        if (!vehicle) {
            return res.status(404).json({ found: false, message: `Vehicle ${number.toUpperCase()} not found in queue` });
        }

        const waitMinutes = (Date.now() - new Date(vehicle.arrival_time).getTime()) / 60000;
        res.json({
            found: true,
            vehicle,
            waitTime: waitMinutes.toFixed(1),
            message: `Found: ${vehicle.vehicle_type} ${vehicle.vehicle_number} — Lane ${vehicle.lane_number} — Waiting ${waitMinutes.toFixed(1)} min`
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  GET QUEUE — GET /api/queue
// ─────────────────────────────────────────
app.get('/api/queue', (req, res) => {
    const { lane } = req.query;
    let queue;

    if (lane && laneTrees[parseInt(lane)]) {
        queue = laneTrees[parseInt(lane)].getQueue();
    } else {
        queue = globalTree.getQueue();
    }

    queue = queue.map(v => ({
        ...v,
        wait_minutes: ((Date.now() - new Date(v.arrival_time).getTime()) / 60000).toFixed(1),
        priority_label: PRIORITY_LABEL[v.priority] || 'NORMAL'
    }));

    res.json({ queue, total: queue.length });
});

// ─────────────────────────────────────────
//  GET AVL TREE STRUCTURE — GET /api/tree
// ─────────────────────────────────────────
app.get('/api/tree', (req, res) => {
    const { lane } = req.query;
    const tree = (lane && laneTrees[parseInt(lane)])
        ? laneTrees[parseInt(lane)].getTree()
        : globalTree.getTree();

    const analytics = globalTree.getAnalytics();
    res.json({ tree, analytics });
});

// ─────────────────────────────────────────
//  GET ALL VEHICLES (DB) — GET /api/vehicles
// ─────────────────────────────────────────
app.get('/api/vehicles', async (req, res) => {
    try {
        const vehicles = await db.getAllVehicles(100);
        res.json({ vehicles });
    } catch (err) {
        res.status(500).json({ error: err.message, vehicles: [] });
    }
});

// ─────────────────────────────────────────
//  GET LOGS — GET /api/logs
// ─────────────────────────────────────────
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await db.getLogs(50);
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: err.message, logs: [] });
    }
});

// ─────────────────────────────────────────
//  GET STATS — GET /api/stats
// ─────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
    try {
        let dbStats = { total: 0, waiting: 0, passed: 0, emergency: 0, avgWait: 0 };
        try { dbStats = await db.getStats(); } catch (e) { }

        let laneStats = [];
        try { laneStats = await db.getLaneStats(); } catch (e) { }

        const analytics = globalTree.getAnalytics();
        const queue = globalTree.getQueue();
        const emergencyInQueue = queue.filter(v => v.priority <= 3).length;

        const laneMap = {};
        [1, 2, 3, 4].forEach(l => { laneMap[l] = laneTrees[l].getSize(); });
        const busiestLane = Object.entries(laneMap).sort((a, b) => b[1] - a[1])[0];

        res.json({
            inQueue: analytics.size,
            treeHeight: analytics.height,
            rotations: analytics.rotations,
            insertions: analytics.insertions,
            deletions: analytics.deletions,
            emergencyInQueue,
            totalVehicles: dbStats.total,
            passedVehicles: dbStats.passed,
            avgWaitTime: dbStats.avgWait,
            busiestLane: busiestLane ? parseInt(busiestLane[0]) : null,
            busiestLaneCount: busiestLane ? parseInt(busiestLane[1]) : 0,
            laneBreakdown: laneMap,
            laneStats
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  DYNAMIC PRIORITY UPDATE — POST /api/vehicles/update-priority
// ─────────────────────────────────────────
app.post('/api/vehicles/update-priority', async (req, res) => {
    try {
        const queue = globalTree.getQueue();
        const updated = [];

        for (const vehicle of queue) {
            const waitMinutes = (Date.now() - new Date(vehicle.arrival_time).getTime()) / 60000;
            const boost = Math.floor(waitMinutes / 3);
            const newPriority = Math.max(1, vehicle.priority - boost);

            if (newPriority < vehicle.priority) {
                globalTree.deleteVehicle(vehicle);
                const boosted = { ...vehicle, priority: newPriority };
                globalTree.insertVehicle(boosted);

                const laneTree = laneTrees[vehicle.lane_number];
                if (laneTree) {
                    laneTree.deleteVehicle(vehicle);
                    laneTree.insertVehicle(boosted);
                }

                try {
                    await db.updateVehiclePriority(vehicle.id, newPriority);
                    await db.addLog(vehicle.id, 'PRIORITY_BOOSTED',
                        `Priority boosted ${vehicle.priority} → ${newPriority} for ${vehicle.vehicle_number} (waited ${waitMinutes.toFixed(1)} min)`);
                } catch (e) { }

                updated.push({
                    vehicle_number: vehicle.vehicle_number,
                    old_priority: vehicle.priority,
                    new_priority: newPriority,
                    wait_minutes: waitMinutes.toFixed(1)
                });
            }
        }

        res.json({
            success: true,
            updated: updated.length,
            changes: updated,
            message: updated.length
                ? `${updated.length} vehicle(s) had priority boosted`
                : 'No priority updates needed'
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  CLEAR LANE — DELETE /api/lane/:number
// ─────────────────────────────────────────
app.delete('/api/lane/:number', async (req, res) => {
    try {
        const laneNum = parseInt(req.params.number);
        if (![1, 2, 3, 4].includes(laneNum)) {
            return res.status(400).json({ error: 'Lane must be 1–4' });
        }

        const laneQueue = laneTrees[laneNum].getQueue();
        laneQueue.forEach(v => globalTree.deleteVehicle(v));
        laneTrees[laneNum].clear();

        try {
            for (const v of laneQueue) {
                await db.updateVehicleStatus(v.id, 'cleared');
                await db.addLog(v.id, 'LANE_CLEARED', `Lane ${laneNum} cleared — ${v.vehicle_type} ${v.vehicle_number} removed`);
            }
        } catch (e) { }

        res.json({
            success: true,
            cleared: laneQueue.length,
            message: `Lane ${laneNum} cleared — ${laneQueue.length} vehicle(s) removed`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  RESET ALL — DELETE /api/reset
// ─────────────────────────────────────────
app.delete('/api/reset', async (req, res) => {
    try {
        Object.values(laneTrees).forEach(t => t.clear());
        globalTree.clear();
        res.json({ success: true, message: 'System reset. All queues cleared.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────
initSystem().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚦 Smart Traffic Management System`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🌐 Dashboard: http://localhost:${PORT}`);
        console.log(`📡 API Base:  http://localhost:${PORT}/api`);
        console.log(`🌳 AVL Tree:  http://localhost:${PORT}/api/tree`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    });
});
