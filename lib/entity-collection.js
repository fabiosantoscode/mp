'use strict';

var assert = require('assert');
var QuadTree = require('../vendor/qtree.js');

module.exports = function makeEntityCollection() {
    var vec = require('./mp').vec
    var lastId = 1;
    // The center of the tree should be in the center of the world. Sort of.
    // But it's got to be 1 pixel below the ground because if it wasn't, every solid on the ground would be a leaf node of the root.
    var qt = QuadTree(-10000, 101 + -10000, 20000, 20000);
    var solid = [];
    var dynamic = [];
    var collection = [];
    var _push = collection.push;
    var _cachedIds = {};
    collection.byId = function entityById(id) {
        if (_cachedIds[id]) return _cachedIds[id];
        var cur = collection.length
        while (cur--) {
            if (collection[cur].id === id) {
                return _cachedIds[id] = collection[cur]
            }
        }
        return null;
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
        qt.get({
            x: entity.center.x - (entity.size.x / 2),
            y: entity.center.y - (entity.size.y / 2),
            w: entity.size.x,
            h: entity.size.y
        }, function (ent) {
            if (search) {
                for (var k of Object.keys(search)) {
                    if (k === 'instanceof') {
                        if (!(ent.entity instanceof search[k])) {
                            return true;
                        }
                    } else if (ent.entity[k] !== search[k]) {
                        return true;
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
        })
        if (!iter) {
            return ret;  // Return an array of matched ents if we're not iterating with a func
        }
    }
    collection.push = function (item) {
        var thisId = lastId++;
        _push.call(this, item);
        var center = vec(item.center);
        var putObj
        qt.put();
        Object.defineProperty(item, 'center', {
            get: () => center,
            set: (newCenter) => {
                if (item._qtObj) qt.remove(item._qtObj, 'id');  // TODO try entity.
                center = newCenter;
                qt.put((item._qtObj = Object.freeze({
                    x: item.center.x - (item.size.x / 2),
                    y: item.center.y - (item.size.y / 2),
                    w: item.size.x,
                    h: item.size.y,
                    entity: item,
                    id: thisId
                })));
            }
        });
        item.center = center  // force a push
    }
    collection.remove = function (ent) {
        if (typeof ent !== 'object') {
            ent = collection.byId(ent);
            if (!ent) { return; }
        }
        if (ent.id) { delete _cachedIds[ent.id] }
        if (ent._qtObj) {
            qt.remove(ent._qtObj, 'id');
        }
        var indx = collection.indexOf(ent)
        if (indx === -1) { return; }
        collection.splice(indx, 1);
    }
    collection.debugDrawTree = function (ctx, offs) {
        var strokes = ['darkred', 'red', 'orange', 'yellow', 'lightyellow']
        ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
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
    return collection;
}

