'use strict';

var abstractPool = require('abstract-pool')
var events = require('events')
var assert = require('assert');
var QuadTree = require('../vendor/qtree.js');

var qtObjPool = abstractPool(() => Object.seal({
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    entity: null,
    id: 0,
}), 64)
function allocateQTObj() {
    return qtObjPool.pop()
}
function deallocateQTObj(qtObj) {
    qtObj.entity = null
    qtObj.id = 0
    qtObjPool.push(qtObj)
}

module.exports = function makeEntityCollection() {
    var vec = require('./mp').vec
    var lastId = 1;
    var range
    var qt
    function initQuadTree() {
        if (!range) range = [-1000, 1000]
        if (qt) assert(false, 'resizing quadtree is unsupported!')
        // The center of the tree should be in the center of the world. Sort of.
        // 1 pixel below the ground because if it wasn't, every solid on the ground would be a leaf node of the root, defeating the quadtree's purpose.
        var w = range[1] - range[0]
        var h = w
        var cx = (range[1] + range[0]) / 2
        var cy = 101
        var x = cx - (w / 2)
        var y = cy - (w / 2)
        qt = QuadTree(x, y, w, h)
    }
    var collection = [];

    var emitter = new events.EventEmitter()
    collection.on = emitter.on.bind(emitter)
    collection.emit = emitter.emit.bind(emitter)

    var _push = collection.push;
    var _cachedIds = new Map();
    collection.byId = function entityById(id) {
        if (_cachedIds.has(id)) return _cachedIds.get(id);
        if (id <= 0) { return null }
        var cur = collection.length
        while (cur--) {
            if (collection[cur].id === id) {
                _cachedIds.set(id, collection[cur])
                return collection[cur]
            }
        }
        return null;
    }
    collection.byPlayerId = function(id) {
        return collection.filter((ent) => ent.playerId === id)[0]
    }
    var emptyEntityList = Object.freeze([])
    collection.collidingWithInstanceOf = function(entity, class_) {
        assert(class_)
        var ret = []
        if (qt) {
            // Cache cent, which is a computed prop
            var cent = entity.center
            qt.getl(
                cent.x - (entity.size.x / 2),
                cent.y - (entity.size.y / 2),
                entity.size.x,
                entity.size.y
            , ent => {
                if (ent.entity instanceof class_ && ent.entity !== entity) ret.push(ent.entity)
                return true
            })
        }
        return ret
    }
    collection.collidingWithTeam = function(entity, team) {
        assert(team)
        var ret = []
        if (qt) {
            // Cache cent, which is a computed prop
            var cent = entity.center
            qt.getl(
                cent.x - (entity.size.x / 2),
                cent.y - (entity.size.y / 2),
                entity.size.x,
                entity.size.y
            , ent => {
                if (ent.entity.team === team && ent.entity !== entity) ret.push(ent.entity)
                return true
            })
        }
        return ret
    }
    collection.collidingWithNonStatic = function(entity) {
        var ret = []
        if (qt) {
            // Cache cent, which is a computed prop
            var cent = entity.center
            qt.getl(
                cent.x - (entity.size.x / 2),
                cent.y - (entity.size.y / 2),
                entity.size.x,
                entity.size.y
            , ent => {
                if (ent.entity.static === false && ent.entity !== entity) ret.push(ent.entity)
                return true;
            })
        }
        return ret
    }
    collection.collidingWithSolid = function(entity) {
        var ret = []
        if (qt) {
            // Cache cent, which is a computed prop
            var cent = entity.center
            qt.getl(
                cent.x - (entity.size.x / 2),
                cent.y - (entity.size.y / 2),
                entity.size.x,
                entity.size.y
            , ent => {
                if (ent.entity.solid && ent.entity !== entity) ret.push(ent.entity)
                return true;
            })
        }
        return ret
    }
    collection.collidingWithSolidLL = function(entity) {
        if (qt) {
            // Cache cent, which is a computed prop
            var cent = entity.center
            return qt.get_solid_ll(
                cent.x - (entity.size.x / 2),
                cent.y - (entity.size.y / 2),
                entity.size.x,
                entity.size.y,
                entity
            )
        }
    }
    collection.collidingWith = function(entity, search, iter) {
        assert(entity.center)
        assert(entity.size)
        if (typeof search === 'function') {
            iter = search;
            search = null;
        }
        assert(search === null || search === undefined || typeof search === 'object')
        if (!iter) {
            var ret = [];
        }
        if (!qt) {
            return iter ? null : []
        }
        function onResult(ent) {
            if (search) {
                for (var k in search) {
                    if (search.hasOwnProperty(k)) {
                        if (ent.entity[k] !== search[k]) {
                            return true;
                        }
                    }
                }
            }
            // if (entity.collide && !entity.collide(ent.entity)) return true;
            if (ent.entity !== entity) {
                if (iter) {
                    iter(ent.entity);
                } else {
                    ret.push(ent.entity);
                }
            }
            return true;
        }
        // Cache cent, which is a computed prop
        var cent = entity.center
        qt.getl(
            cent.x - (entity.size.x / 2),
            cent.y - (entity.size.y / 2),
            entity.size.x,
            entity.size.y
        , onResult)
        if (!iter) {
            return ret;  // Return an array of matched ents if we're not iterating with a func
        }
    }
    collection.push = function (item) {
        var thisId = lastId++;
        if (item.id) { _cachedIds.set(item.id, item) }
        _push.call(this, item);
        var putObj
        if (!qt) initQuadTree()
        var foundInside, indexInCollection, node
        function findNode(myself, inside_, index_, node_) {
            if (node_[inside_][index_].entity !== item) {
                return true
            }

            foundInside = inside_
            indexInCollection = index_
            node = node_
            return false
        }
        item.onUpdateCenter = (center, newCenter) => {
            if (item._qtObj) {
                var centerChanged =
                    center.x !== newCenter.x
                 || center.y !== newCenter.y
                if (!centerChanged) { return; }

                var w = item.size.x
                var h = item.size.y
                var x = center.x - (w / 2)
                var y = center.y - (h / 2)

                foundInside = indexInCollection = node = undefined

                qt.get(item._qtObj, findNode)

                var qEnt = node[foundInside][indexInCollection]

                var isRoot = node === qt.getRoot()

                var sizeChanged = qEnt.w !== w || qEnt.h !== h

                // If the size has changed, these optimizations don't make sense
                if (!sizeChanged) {
                    if (foundInside === 'c' && !isRoot) {
                        // This entity is a child of the qNode.
                        // So it is completely inside it. If not,
                        // Remove it and go again
                        if (node.x < newCenter.x - (w / 2) &&
                            node.x + node.w > newCenter.x + (w / 2) &&
                            node.y < newCenter.y - (h / 2) &&
                            node.y + node.h > newCenter.y + (h / 2)) {
                            // Skippin'!
                            item._qtObj.x = x
                            item._qtObj.y = y
                            item._qtObj.w = w
                            item._qtObj.h = h
                            return
                        }
                    } else if (foundInside === 'l' && !isRoot) {
                        // This entity belongs to a certain node, but it's in between one or more of its two child nodes so it's not a child of it or any of its child nodes.
                        // If it's still in between, move it and skip.
                        var halfX = node.x + (node.w / 2)
                        var halfY = node.y + (node.h / 2)


                        if ((x < halfX && x + w > halfX) &&
                            !(y < node.y || y + h > node.y + node.h)
                            ||
                            (y < halfY && y + h > halfY) &&
                            !(x < node.x || x + w > node.x + node.w)) {
                            // Skippin'!
                            item._qtObj.x = x
                            item._qtObj.y = y
                            item._qtObj.w = w
                            item._qtObj.h = h
                            return
                        }
                    }
                }
                qt.remove(item._qtObj, 'id')
            }

            if (!item._qtObj) {
                item._qtObj = allocateQTObj()
            }
            item._qtObj.x = newCenter.x - (item.size.x / 2)
            item._qtObj.y = newCenter.y - (item.size.y / 2)
            item._qtObj.w = item.size.x
            item._qtObj.h = item.size.y
            item._qtObj.entity = item
            item._qtObj.id = thisId
            qt.put(item._qtObj)
        };
        item.center = item.center  // force a push
        item._qtObj.id = thisId  // Add my incremental ID to the _qtObj
        this.emit('add', item)
    }
    collection.recentlyRemoved = null
    var pools = new Map()
    function getPool(Klass) {
        if (!pools.has(Klass)) {
            pools.set(Klass,
                abstractPool(() => Object.create(Klass.prototype),
                    Klass.prototype.poolSize
                )
            )
        }
        return pools.get(Klass)
    }
    collection.construct = function (Klass, ...args) {
        assert(Klass.prototype.constructor)
        var obj = getPool(Klass).pop()
        Klass.apply(obj, args)
        Object.seal(obj)
        return obj
    }
    collection.remove = function (ent) {
        if (typeof ent !== 'object') {
            ent = collection.byId(ent);
            if (!ent) { return; }
        }
        if (collection.recentlyRemoved) { collection.recentlyRemoved.push(ent) }
        if (ent.id) { _cachedIds.delete(ent.id) }
        var indx = collection.indexOf(ent)
        if (indx === -1) { return; }
        if (ent._qtObj) {
            qt.remove(ent._qtObj, 'id');
        }
        collection.splice(indx, 1);
        this.emit('remove', ent)
        assert(ent._qtObj)
        deallocateQTObj(ent._qtObj)
        ent._qtObj = null
        if (pools.has(ent.constructor)) {
            var pool = getPool(ent.constructor)
            if (pool.store.length < ent.constructor.prototype.poolSize * 1.5) {
                ent.destroy()
                pool.push(ent)
            } else {
                console.warn('Allocated ' + pool.store.length + ' objects of type ' + ent.constructor.name)
            }
        }
    }
    collection.debugDrawTree = function (ctx, offs) {
        var strokes = ['darkred', 'red', 'orange', 'yellow', 'lightyellow']
        ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
        if (!qt) { return }
        var root = qt.getRoot();
        var level = 0
        function drawTreeRect(root) {
            ctx.strokeStyle = strokes[level] || 'blue'
            ctx.strokeRect(Math.floor(root.x - offs.x), Math.floor(root.y), Math.floor(root.w), Math.floor(root.h));
            for (var subTree of root.n) {
                level++
                if (subTree.x < offs.x + 100 && subTree.x + subTree.w > offs.x)
                drawTreeRect(subTree);
                level--
            }
            for (var leaf of root.l) {
                ctx.fillRect(
                    Math.floor(leaf.x - offs.x - 1),
                    Math.floor(leaf.y - 1),
                    Math.floor(leaf.w + 2),
                    Math.floor(leaf.h + 2));
            }
            for (var leaf of root.c) {
                /*ctx.strokeRect(
                    Math.floor(leaf.x - offs.x),
                    Math.floor(leaf.y),
                    Math.floor(leaf.w),
                    Math.floor(leaf.h));*/
            }
        }
        drawTreeRect(root);
    }

    Object.defineProperty(collection, 'range', {
        get: () => range,
        set: (rng) => { range = rng; initQuadTree() }
    })
    return collection;
}

