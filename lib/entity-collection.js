'use strict';

var assert = require('assert');
var QuadTree = require('simple-quadtree');

module.exports = function makeEntityCollection() {
    var vec = require('./mp').vec
    var lastId = 1;
    var qt = QuadTree(-1000, -100, 2000, 100);
    var solid = [];
    var dynamic = [];
    var collection = [];
    var _push = collection.push;
    collection.all = function* () {
        for (var x of collection) yield x;
    }
    var _cachedIds = {};
    collection.byId = function entityById(id) {
        if (_cachedIds[id]) return _cachedIds[id];
        var thisEnt = collection.filter((ent) => ent.id === id)
        assert(thisEnt.length <= 1, 'More than one entity in this world has ID ' + id);
        if (thisEnt[0]) { _cachedIds[id] = thisEnt[0] };
        return thisEnt[0] || null;
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
    return collection;
}

