'use strict';

var events = require('events')
var assert = require('assert');
var QuadTree = require('../vendor/qtree.js');

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

    var recentlyRemoved = []
    var _push = collection.push;
    var _cachedIds = {};
    collection.byId = function entityById(id) {
        if (_cachedIds[id]) return _cachedIds[id];
        if (id <= 0) { return null }
        var cur = collection.length
        while (cur--) {
            if (collection[cur].id === id) {
                return _cachedIds[id] = collection[cur]
            }
        }
        return null;
    }
    collection.byPlayerId = function(id) {
        return collection.filter((ent) => ent.playerId === id)[0]
    }
    collection.collidingWithInstanceOf = function(entity, class_) {
        assert(class_)
        var ret = []
        if (qt) {
            // Cache cent, which is a computed prop
            var cent = entity.center
            qt.get({
                x: cent.x - (entity.size.x / 2),
                y: cent.y - (entity.size.y / 2),
                w: entity.size.x,
                h: entity.size.y
            }, ent => {
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
            qt.get({
                x: cent.x - (entity.size.x / 2),
                y: cent.y - (entity.size.y / 2),
                w: entity.size.x,
                h: entity.size.y
            }, ent => {
                if (ent.entity.team === team && ent.entity !== entity) ret.push(ent.entity)
                return true
            })
        }
        return ret
    }
    collection.collidingWithSolid = function(entity) {
        var ret = []
        if (qt) {
            // Cache cent, which is a computed prop
            var cent = entity.center
            qt.get({
                x: cent.x - (entity.size.x / 2),
                y: cent.y - (entity.size.y / 2),
                w: entity.size.x,
                h: entity.size.y
            }, ent => {
                if (ent.entity.solid && ent.entity !== entity) ret.push(ent.entity)
                return true;
            })
        }
        return ret
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
        qt.get({
            x: cent.x - (entity.size.x / 2),
            y: cent.y - (entity.size.y / 2),
            w: entity.size.x,
            h: entity.size.y
        }, onResult)
        if (!iter) {
            return ret;  // Return an array of matched ents if we're not iterating with a func
        }
    }
    collection.push = function (item) {
        var thisId = lastId++;
        if (item.id) { _cachedIds[item.id] = item }
        _push.call(this, item);
        var center = vec(item.center);
        var putObj
        if (!qt) initQuadTree()
        Object.defineProperty(item, 'center', {
            get: () => center,
            set: (newCenter) => {
                if (item._qtObj) {
                    var w = item.size.x
                    var h = item.size.y
                    var x = item.center.x - (w / 2)
                    var y = item.center.y - (h / 2)

                    var foundEnt
                    var qEnt
                    qt.get(item._qtObj, function(myself, nii) {
                        if (nii.node[nii.inside][nii.index].entity !== item) {
                            return true
                        }

                        foundEnt = nii
                        return false
                    })
                    assert(foundEnt, 'somehow, did not find the ' + item.constructor.name + ' entity in the entity collection.')

                    var qEnt = foundEnt.node[foundEnt.inside][foundEnt.index]

                    var skip = () => {
                        qEnt.x = x
                        qEnt.y = y
                        qEnt.w = w
                        qEnt.h = h
                        center = newCenter
                    }

                    var isRoot = foundEnt.node === qt.getRoot()


                    var sizeChanged = qEnt.w !== w || qEnt.h !== h

                    var centerChanged =
                        center.x !== newCenter.x
                     || center.y !== newCenter.y

                    // If the size has changed, these optimizations don't make sense
                    if (!sizeChanged) {
                        if (!centerChanged) { return; }

                        if (foundEnt.inside === 'c' && !isRoot) {
                            // This entity is a child of the qNode.
                            // So it is completely inside it. If not,
                            // Remove it and go again
                            if (foundEnt.node.x < newCenter.x - (w / 2) &&
                                foundEnt.node.x + foundEnt.node.w > newCenter.x + (w / 2) &&
                                foundEnt.node.y < newCenter.y - (h / 2) &&
                                foundEnt.node.y + foundEnt.node.h > newCenter.y + (h / 2)) {
                                // Skippin'!
                                skip()
                                return
                            }
                        } else if (foundEnt.inside === 'l' && !isRoot) {
                            // This entity belongs to a certain node, but it's in between one or more of its two child nodes so it's not a child of it or any of its child nodes.
                            // If it's still in between, move it and skip.
                            var halfX = foundEnt.node.x + (foundEnt.node.w / 2)
                            var halfY = foundEnt.node.y + (foundEnt.node.h / 2)


                            if ((x < halfX && x + w > halfX) &&
                                !(y < foundEnt.node.y || y + h > foundEnt.node.y + foundEnt.node.h)
                                ||
                                (y < halfY && y + h > halfY) &&
                                !(x < foundEnt.node.x || x + w > foundEnt.node.x + foundEnt.node.w)) {
                                // Skippin'!
                                skip()
                                return
                            }
                        }
                    }
                    qt.remove(item._qtObj, 'id')
                }

                center = newCenter;
                qt.put((item._qtObj = {
                    x: newCenter.x - (item.size.x / 2),
                    y: newCenter.y - (item.size.y / 2),
                    w: item.size.x,
                    h: item.size.y,
                    entity: item,
                    id: thisId
                }));
            }
        });
        item.center = center  // force a push
        this.emit('add', item)
    }
    Object.defineProperty(collection, 'recentlyRemoved', {
        get: () => recentlyRemoved,
        set: (rec) => { recentlyRemoved = rec }
    })
    collection.remove = function (ent) {
        if (typeof ent !== 'object') {
            ent = collection.byId(ent);
            if (!ent) { return; }
        }
        recentlyRemoved.push(ent)
        if (ent.id) { delete _cachedIds[ent.id] }
        if (ent._qtObj) {
            qt.remove(ent._qtObj, 'id');
        }
        var indx = collection.indexOf(ent)
        if (indx === -1) { return; }
        collection.splice(indx, 1);
        this.emit('remove', ent)
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

