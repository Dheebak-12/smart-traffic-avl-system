# Smart Traffic Management System — AVL Tree

> **A real-time, priority-based traffic junction management system powered by an AVL (Adelson-Velsky and Landis) self-balancing Binary Search Tree, with a live D3.js visualization dashboard and PostgreSQL persistence.**

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Objective](#objective)
4. [Why AVL Tree?](#why-avl-tree)
5. [System Architecture](#system-architecture)
6. [Tech Stack](#tech-stack)
7. [Project Structure](#project-structure)
8. [AVL Tree Implementation](#avl-tree-implementation)
9. [Database Schema](#database-schema)
10. [API Reference](#api-reference)
11. [Features](#features)
12. [Getting Started](#getting-started)
13. [Vehicle Number Format](#vehicle-number-format)
14. [Priority System](#priority-system)
15. [Complexity Analysis](#complexity-analysis)
16. [Use Cases](#use-cases)
17. [Future Scope](#future-scope)

---

## Overview

The **Smart Traffic Management System** simulates a real-world 4-lane traffic junction where vehicles of different types (Ambulance, Fire Truck, Police, Bus, Car, Bike) are dynamically scheduled based on **priority** using an AVL Tree as the core data structure.

Every insertion, deletion, and search operation runs in **O(log n)** time — guaranteed by the self-balancing property of the AVL Tree. The system features:

- **Real-time AVL Tree visualization** (powered by D3.js)
- **PostgreSQL persistence** for all vehicle records and activity logs
- **Dynamic priority boosting** to prevent starvation
- **Vehicle number validation** (format + uniqueness)
- **Professional dark dashboard UI** with SVG icons and animations

---

## Problem Statement

At busy traffic junctions, all vehicles — from emergency services to everyday commuters — arrive at unpredictable times. A naive **FIFO (First-In, First-Out)** queue fails because:

- An ambulance stuck behind 10 cars loses precious response time
- Emergency vehicles have no mechanism to preempt normal traffic
- As the queue grows, searching for a vehicle becomes O(n) slow

**How can we ensure that the highest-priority vehicle ALWAYS passes first, while maintaining O(log n) performance even with thousands of vehicles?**

---

## Objective

1. Implement an **AVL Tree** to manage vehicle scheduling at a 4-lane junction
2. Ensure emergency vehicles (Ambulance, Fire Truck, Police) always get the highest priority
3. Demonstrate **O(log n)** time complexity for Insert, Delete, and Search operations
4. Persist all vehicle records and logs in **PostgreSQL**
5. Provide a **professional live dashboard** with visual AVL Tree rendering
6. Implement **anti-starvation** through dynamic priority boosting

---

## Why AVL Tree?

| Data Structure | Insert | Delete | Search | Balanced? |
|----------------|--------|--------|--------|-----------|
| Unsorted Array | O(1)   | O(n)   | O(n)   | No        |
| Sorted Array   | O(n)   | O(n)   | O(log n) | Yes     |
| BST (skewed)   | O(n)   | O(n)   | O(n)   | No        |
| **AVL Tree**   | **O(log n)** | **O(log n)** | **O(log n)** | **Always** |
| Heap (Min)     | O(log n) | O(log n) | O(n) | Yes      |

An **AVL Tree** is chosen because:

- **Self-balancing** — rotations (LL, RR, LR, RL) keep the tree height at `O(log n)` regardless of insertion order
- **In-order traversal** gives vehicles sorted by priority automatically
- **No O(n) degradation** unlike a plain BST that can become a linked list
- **Supports search** — unlike a Min-Heap which only supports O(1) peek but O(n) search
- The **Balance Factor** (BF = height(left) − height(right)) must stay in {−1, 0, +1} at every node

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Browser Dashboard                   │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────┐ │
│  │  Add Vehicle │  │  AVL Tree Viz │  │  Queue   │ │
│  │  Form        │  │  (D3.js)      │  │  Display │ │
│  └──────┬───────┘  └───────┬───────┘  └────┬─────┘ │
│         │                  │               │        │
└─────────┼──────────────────┼───────────────┼────────┘
          │       HTTP / REST API             │
          ▼                                  ▼
┌─────────────────────────────────────────────────────┐
│               Express.js API Server                  │
│  ┌─────────────────────────────────────────────┐    │
│  │                AVL Tree Engine               │    │
│  │  ┌──────────┐  ┌────────────┐  ┌─────────┐ │    │
│  │  │ Insert   │  │ Delete-Min │  │ Search  │ │    │
│  │  │ O(log n) │  │ O(log n)   │  │ O(log n)│ │    │
│  │  └──────────┘  └────────────┘  └─────────┘ │    │
│  │                                             │    │
│  │  globalTree (all lanes)                     │    │
│  │  laneTrees[1..4] (per-lane trees)           │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │            database.js (PostgreSQL)          │    │
│  │   vehicles table     logs table              │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│   PostgreSQL DB     │
│   traffic_db        │
│   Port: 1101        │
└─────────────────────┘
```

---

## Tech Stack

| Layer       | Technology                  | Purpose                              |
|-------------|-----------------------------|--------------------------------------|
| Frontend    | HTML5, CSS3, JavaScript     | Dashboard UI                         |
| Visualization | D3.js v7                  | Live AVL Tree rendering              |
| Backend     | Node.js 18+, Express.js 4   | REST API server                      |
| Data Structure | AVL Tree (custom JS)     | Core scheduling engine               |
| Database    | PostgreSQL 18               | Persistent storage + activity logs   |
| Fonts       | Inter, JetBrains Mono       | Typography                           |
| Icons       | Inline SVG sprites          | Resolution-independent icons         |

---

## Project Structure

```
smart-traffic-avl/
│
├── avl.js              # AVL Tree implementation (core engine)
├── database.js         # PostgreSQL database handler
├── server.js           # Express REST API server
├── package.json        # Node.js project metadata & dependencies
├── .env                # Environment variables (DB credentials)
│
└── public/
    ├── index.html      # Dashboard HTML with SVG sprite definitions
    ├── style.css       # Dark professional theme stylesheet
    └── app.js          # Frontend JS: API calls + D3.js visualization
```

---

## AVL Tree Implementation

Located in `avl.js`. Key methods:

### Node Structure
```javascript
{
  vehicle:      { id, vehicle_number, vehicle_type, priority, lane_number, ... },
  height:       Number,   // Height of this node in the tree
  left:         Node,     // Left child (lower priority value = higher urgency)
  right:        Node      // Right child
}
```

### Sorting Key
Vehicles are sorted by a composite key:
1. **Priority** (primary) — lower value = higher urgency (Ambulance=1, Bike=6)
2. **Arrival Time** (secondary) — FIFO within same priority
3. **ID** (tiebreaker)

### Rotation Types
| Imbalance | Rotation | Trigger |
|-----------|----------|---------|
| Left-Left | Single Right | BF > 1, left child BF ≥ 0 |
| Right-Right | Single Left | BF < -1, right child BF ≤ 0 |
| Left-Right | Double (Left then Right) | BF > 1, left child BF < 0 |
| Right-Left | Double (Right then Left) | BF < -1, right child BF > 0 |

### Key Methods
```javascript
tree.insertVehicle(vehicle)      // O(log n) — insert + rebalance
tree.deleteVehicle(vehicle)      // O(log n) — delete + rebalance
tree.removeHighestPriority()     // O(log n) — remove leftmost node
tree.search(vehicle_number)      // O(n) in-order scan (by number)
tree.getQueue()                  // O(n) in-order traversal
tree.getTree()                   // Get tree structure for D3.js
tree.getAnalytics()              // Height, size, rotations, insertions
tree.clear()                     // Reset tree
```

---

## Database Schema

### `vehicles` table
```sql
CREATE TABLE vehicles (
  id            SERIAL PRIMARY KEY,
  vehicle_number VARCHAR(10)  NOT NULL UNIQUE,
  vehicle_type  VARCHAR(50)  NOT NULL,
  priority      INTEGER      NOT NULL,
  arrival_time  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  lane_number   INTEGER      NOT NULL CHECK (lane_number BETWEEN 1 AND 4),
  status        VARCHAR(20)  NOT NULL DEFAULT 'waiting',
                             -- 'waiting' | 'passed' | 'cleared'
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### `logs` table
```sql
CREATE TABLE logs (
  log_id     SERIAL PRIMARY KEY,
  vehicle_id INTEGER REFERENCES vehicles(id),
  action     VARCHAR(50) NOT NULL,
             -- VEHICLE_ADDED | SIGNAL_GREEN | PRIORITY_BOOSTED | LANE_CLEARED
  message    TEXT,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## API Reference

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server + DB connection status |

### Vehicles
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/vehicles` | Add vehicle to queue (Insert O(log n)) |
| `DELETE` | `/api/vehicles/remove` | Signal green — remove highest priority (Delete O(log n)) |
| `DELETE` | `/api/vehicles/remove?lane=N` | Signal green for specific lane |
| `GET` | `/api/vehicles/search?number=TN01AB1234` | Search vehicle in queue (O(log n)) |
| `GET` | `/api/vehicles` | Fetch all DB records |
| `POST` | `/api/vehicles/update-priority` | Dynamic priority boost (anti-starvation) |

### Queue & Tree
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/queue` | In-order traversal (sorted priority queue) |
| `GET` | `/api/queue?lane=N` | Queue for a specific lane |
| `GET` | `/api/tree` | AVL Tree structure for D3.js visualization |
| `GET` | `/api/tree?lane=N` | Lane-specific tree |

### Stats & Logs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stats` | System statistics (queue size, wait times, lane density) |
| `GET` | `/api/logs` | Recent activity logs |

### Lane Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| `DELETE` | `/api/lane/:number` | Clear all vehicles from a lane |
| `DELETE` | `/api/reset` | Reset entire system |

### POST Body (Add Vehicle)
```json
{
  "vehicle_number": "TN01AB1234",
  "vehicle_type":   "Ambulance",
  "lane_number":    2
}
```

---

## Features

### Core
- **AVL Tree Engine** — self-balancing BST with rotation tracking
- **4-Lane Management** — independent AVL tree per lane + global priority tree
- **Priority Queue** — highest urgency vehicle always removed first (O(log n))
- **PostgreSQL** — persistent storage with ACID compliance
- **In-memory fallback** — runs without DB if PostgreSQL is unavailable

### Validation
- **Plate Format** — enforces `LL·NN·LL·NNNN` pattern (2 letters, 2 digits, 2 letters, 4 digits)
- **Real-time feedback** — segment-by-segment colour hints as user types
- **Uniqueness check** — both frontend (queue cache) and backend (AVL tree scan)
- **Auto-uppercase** — auto-converts input to uppercase
- **Server-side fallback** — HTTP 400/409 even if JS is bypassed

### Dashboard
- **Live AVL Tree** — D3.js force-directed tree with node labels, balance factors, and tooltips
- **Traffic Queue** — sorted real-time queue with wait times and priority badges
- **Lane Density** — animated progress bars showing vehicle count per lane
- **Stats Bar** — queue size, emergency count, passed vehicles, rotation count, busiest lane
- **Activity Logs** — real-time log of all actions (add, pass, boost, clear)
- **DB Records** — scrollable table of all vehicle records from PostgreSQL

### Smart Features
- **Dynamic Priority Boost** — vehicles waiting > 3 minutes get priority bumped (anti-starvation)
- **Lane Signal Control** — clear highest priority globally or per lane
- **Full Lane Reset** — clear all vehicles from any specific lane

---

## Getting Started

### Prerequisites
- **Node.js** v18 or higher
- **PostgreSQL** v14 or higher (running on your machine)

### Installation

```bash
# 1. Navigate to project directory
cd z:\dsa_rev

# 2. Install dependencies
npm install

# 3. Create the PostgreSQL database
# Connect to postgres and run:
CREATE DATABASE traffic_db;

# 4. Configure environment (edit .env)
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=5432        # your PostgreSQL port
DB_NAME=traffic_db
DB_USER=postgres
DB_PASSWORD=your_password

# 5. Start the server
node server.js

# 6. Open your browser
# http://localhost:3000
```

### Development Mode (auto-restart)
```bash
npm run dev
```

### .env Example
```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=1101
DB_NAME=traffic_db
DB_USER=postgres
DB_PASSWORD=postgres
```

---

## Vehicle Number Format

Indian vehicle registration number format:

```
TN  01  AB  1234
──  ──  ──  ────
│   │   │    └── 4 digits  (serial number)
│   │   └─────── 2 letters (series)
│   └─────────── 2 digits  (district code)
└─────────────── 2 letters (state code)
```

| Position | Type | Example | Rule |
|----------|------|---------|------|
| 1–2 | Letters | `TN` | State code |
| 3–4 | Digits | `01` | District |
| 5–6 | Letters | `AB` | Series |
| 7–10 | Digits | `1234` | Serial |

Valid examples: `TN01AB1234`, `KA05MZ5678`, `MH02CD3456`

---

## Priority System

| Vehicle Type | Priority | Label | Rationale |
|-------------|----------|-------|-----------|
| Ambulance   | **1** (Highest) | EMERGENCY | Life-critical response |
| Fire Truck  | **2** | EMERGENCY | Fire hazard response |
| Police      | **3** | EMERGENCY | Law enforcement / emergency |
| Bus         | **4** | HIGH | Mass transit (many passengers) |
| Car         | **5** | NORMAL | Standard private vehicle |
| Bike        | **6** (Lowest) | NORMAL | Smallest vehicle, most agile |

**Dynamic Boost**: Every 3 minutes of waiting, a vehicle's priority is automatically incremented by 1 (capped at Priority 1), preventing indefinite waiting (starvation).

---

## Complexity Analysis

| Operation | AVL Tree | Naive Queue | Sorted Array |
|-----------|----------|-------------|--------------|
| Add Vehicle (Insert) | **O(log n)** | O(1) | O(n) |
| Signal Green (Delete-Min) | **O(log n)** | O(n) | O(1) |
| Search Vehicle | **O(n)** | O(n) | O(log n) |
| AVL Rebalance (Rotation) | **O(1)** | — | — |
| Get Sorted Queue (Traversal) | **O(n)** | O(n log n) | O(n) |
| Tree Height | **O(log n)** | — | — |

**Space Complexity**: O(n) — one node per vehicle in the queue.

**Why O(log n) for delete?**
The AVL tree always maintains `height ≤ 1.44 × log₂(n+2)`. The minimum node is always the leftmost node — reached in `O(log n)` steps. After deletion, at most `O(log n)` rotations are needed to rebalance.

---

## Use Cases

1. **Emergency Response**: Ambulance in Lane 3 immediately preempts all waiting cars — Signal Green passes the ambulance first.

2. **Anti-Starvation**: A Bus waiting for 10 minutes gradually gets priority boosted from P4 → P3 → P2, eventually overtaking newer normal vehicles.

3. **Multi-Lane Management**: Each lane has its own AVL Tree for local control. The global tree enables system-wide highest-priority dispatching.

4. **Load Analysis**: Lane density bars immediately show traffic supervisors which lane needs more signal time.

5. **Audit Trail**: Every action (add, pass, boost) is logged in PostgreSQL for post-incident analysis.

---

## Future Scope

- **Real-time IoT Integration** — RFID / camera-based vehicle detection at entry points
- **ML-based Wait Time Prediction** — historical data to predict congestion
- **Multi-Junction Coordination** — coordinate across multiple traffic signals in a network
- **CCTV Integration** — license plate recognition to auto-populate vehicle number
- **Mobile App** — traffic officer app to view and control signal from phone
- **Emergency Pre-emption Signal** — trigger physical signal hardware via GPIO / relay
- **Dijkstra Integration** — route optimization across the city road network using the priority data

---

## Author

**Smart Traffic Management System**  
*Data Structures & Algorithms Project*  
*Implementation: AVL Self-Balancing Binary Search Tree*

---

## License

MIT License — free to use for academic and educational purposes.
