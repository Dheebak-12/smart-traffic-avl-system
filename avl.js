/**
 * =============================================
 *   AVL Tree Implementation
 *   Smart Traffic Management System — Core Engine
 * =============================================
 *
 * AVL Tree guarantees O(log n) for:
 *   - Insert  (vehicle enters junction)
 *   - Delete  (signal green → vehicle passes)
 *   - Search  (find vehicle by number)
 *
 * Tree sorted by:
 *   1. Priority  (lower = higher priority)
 *   2. Arrival Time (FIFO within same priority)
 *   3. ID (unique tiebreaker)
 */

class AVLNode {
  constructor(vehicle) {
    this.vehicle = { ...vehicle };
    this.height = 1;
    this.left = null;
    this.right = null;
  }
}

class AVLTree {
  constructor() {
    this.root = null;
    this.rotationCount = 0;   // Track rotations performed
    this.insertCount = 0;     // Track total insertions
    this.deleteCount = 0;     // Track total deletions
  }

  // ─────────────────────────────────────────
  //  COMPARISON FUNCTION
  //  Returns negative if vehicle `a` has HIGHER priority than `b`
  //  (i.e., should appear in-order BEFORE b)
  // ─────────────────────────────────────────
  _compare(a, b) {
    // Rule 1: Lower priority number = more urgent
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Rule 2: Earlier arrival = higher priority (FIFO within same type)
    const timeA = new Date(a.arrival_time).getTime();
    const timeB = new Date(b.arrival_time).getTime();
    if (timeA !== timeB) return timeA - timeB;
    // Rule 3: Tiebreaker using vehicle ID
    return (a.id || 0) - (b.id || 0);
  }

  // ─────────────────────────────────────────
  //  HEIGHT & BALANCE UTILITIES
  // ─────────────────────────────────────────
  _height(node) {
    return node ? node.height : 0;
  }

  _getBalanceFactor(node) {
    return node ? this._height(node.left) - this._height(node.right) : 0;
  }

  _updateHeight(node) {
    if (node) {
      node.height = 1 + Math.max(this._height(node.left), this._height(node.right));
    }
  }

  // ─────────────────────────────────────────
  //  ROTATIONS
  //  Restore AVL balance property (|BF| ≤ 1)
  // ─────────────────────────────────────────

  /**
   * Right Rotation (LL Case):
   *       y                x
   *      / \     →        / \
   *     x   T3          T1   y
   *    / \                  / \
   *  T1   T2              T2   T3
   */
  _rightRotate(y) {
    this.rotationCount++;
    const x = y.left;
    const T2 = x.right;
    x.right = y;
    y.left = T2;
    this._updateHeight(y);
    this._updateHeight(x);
    return x;
  }

  /**
   * Left Rotation (RR Case):
   *    x                   y
   *   / \      →          / \
   *  T1   y              x   T3
   *      / \            / \
   *     T2  T3         T1  T2
   */
  _leftRotate(x) {
    this.rotationCount++;
    const y = x.right;
    const T2 = y.left;
    y.left = x;
    x.right = T2;
    this._updateHeight(x);
    this._updateHeight(y);
    return y;
  }

  // ─────────────────────────────────────────
  //  REBALANCE NODE
  //  Checks balance factor and applies appropriate rotation
  // ─────────────────────────────────────────
  _rebalance(node) {
    if (!node) return null;
    this._updateHeight(node);
    const bf = this._getBalanceFactor(node);

    // LEFT LEFT CASE → single right rotation
    if (bf > 1 && this._getBalanceFactor(node.left) >= 0) {
      return this._rightRotate(node);
    }

    // LEFT RIGHT CASE → left rotation on left child, then right rotation
    if (bf > 1 && this._getBalanceFactor(node.left) < 0) {
      node.left = this._leftRotate(node.left);
      return this._rightRotate(node);
    }

    // RIGHT RIGHT CASE → single left rotation
    if (bf < -1 && this._getBalanceFactor(node.right) <= 0) {
      return this._leftRotate(node);
    }

    // RIGHT LEFT CASE → right rotation on right child, then left rotation
    if (bf < -1 && this._getBalanceFactor(node.right) > 0) {
      node.right = this._rightRotate(node.right);
      return this._leftRotate(node);
    }

    return node; // Already balanced
  }

  // ─────────────────────────────────────────
  //  INSERT OPERATION — O(log n)
  // ─────────────────────────────────────────
  _insert(node, vehicle) {
    // Standard BST insert
    if (!node) return new AVLNode(vehicle);

    const cmp = this._compare(vehicle, node.vehicle);
    if (cmp < 0) {
      node.left = this._insert(node.left, vehicle);
    } else {
      // Equal priority treated as right child to maintain stability
      node.right = this._insert(node.right, vehicle);
    }

    // Rebalance on the way back up (post-order)
    return this._rebalance(node);
  }

  insertVehicle(vehicle) {
    this.root = this._insert(this.root, vehicle);
    this.insertCount++;
  }

  // ─────────────────────────────────────────
  //  DELETE OPERATION — O(log n)
  // ─────────────────────────────────────────
  _getMin(node) {
    while (node && node.left) node = node.left;
    return node;
  }

  // Delete the leftmost (highest priority) node
  _deleteMin(node) {
    if (!node.left) return node.right;
    node.left = this._deleteMin(node.left);
    return this._rebalance(node);
  }

  // Delete a specific vehicle node (matched by priority + time + id)
  _delete(node, vehicle) {
    if (!node) return null;

    const cmp = this._compare(vehicle, node.vehicle);

    if (cmp < 0) {
      node.left = this._delete(node.left, vehicle);
    } else if (cmp > 0) {
      node.right = this._delete(node.right, vehicle);
    } else {
      // Priority & time match → verify by ID if available
      if (vehicle.id && node.vehicle.id !== vehicle.id) {
        node.right = this._delete(node.right, vehicle);
      } else {
        // FOUND: Delete this node
        if (!node.left) return node.right;
        if (!node.right) return node.left;

        // Replace with in-order successor (min of right subtree)
        const successor = this._getMin(node.right);
        node.vehicle = { ...successor.vehicle };
        node.right = this._deleteMin(node.right);
      }
    }
    return this._rebalance(node);
  }

  // ─────────────────────────────────────────
  //  REMOVE HIGHEST PRIORITY — O(log n)
  //  Called when traffic signal turns GREEN
  // ─────────────────────────────────────────
  removeHighestPriority() {
    if (!this.root) return null;
    const minNode = this._getMin(this.root);
    const vehicle = { ...minNode.vehicle };
    this.root = this._deleteMin(this.root);
    this.deleteCount++;
    return vehicle;
  }

  // Delete a specific vehicle from the tree
  deleteVehicle(vehicle) {
    this.root = this._delete(this.root, vehicle);
    this.deleteCount++;
  }

  // ─────────────────────────────────────────
  //  SEARCH — O(log n) average
  //  Note: since tree is sorted by priority, not vehicle_number,
  //  we do full tree traversal for number search (still fast in practice)
  // ─────────────────────────────────────────
  _searchByNumber(node, vehicleNumber) {
    if (!node) return null;
    if (node.vehicle.vehicle_number === vehicleNumber) return node.vehicle;
    const fromLeft = this._searchByNumber(node.left, vehicleNumber);
    if (fromLeft) return fromLeft;
    return this._searchByNumber(node.right, vehicleNumber);
  }

  search(vehicleNumber) {
    return this._searchByNumber(this.root, vehicleNumber.toUpperCase().trim());
  }

  // ─────────────────────────────────────────
  //  IN-ORDER TRAVERSAL → Priority Queue
  //  Returns vehicles sorted: highest priority first
  // ─────────────────────────────────────────
  _inOrder(node, result) {
    if (!node) return;
    this._inOrder(node.left, result);
    result.push({ ...node.vehicle });
    this._inOrder(node.right, result);
  }

  getQueue() {
    const result = [];
    this._inOrder(this.root, result);
    return result;
  }

  // ─────────────────────────────────────────
  //  TREE STRUCTURE → For D3.js Visualization
  // ─────────────────────────────────────────
  _getStructure(node) {
    if (!node) return null;
    return {
      name: node.vehicle.vehicle_number,
      vehicle: { ...node.vehicle },
      height: node.height,
      balance: this._getBalanceFactor(node),
      left: this._getStructure(node.left),
      right: this._getStructure(node.right)
    };
  }

  getTree() {
    return this._getStructure(this.root);
  }

  // ─────────────────────────────────────────
  //  UTILITY METHODS
  // ─────────────────────────────────────────
  _size(node) {
    if (!node) return 0;
    return 1 + this._size(node.left) + this._size(node.right);
  }

  getSize() { return this._size(this.root); }

  getHeight() { return this._height(this.root); }

  getAnalytics() {
    return {
      size: this.getSize(),
      height: this.getHeight(),
      rotations: this.rotationCount,
      insertions: this.insertCount,
      deletions: this.deleteCount
    };
  }

  clear() {
    this.root = null;
    this.rotationCount = 0;
    this.insertCount = 0;
    this.deleteCount = 0;
  }
}

module.exports = AVLTree;
