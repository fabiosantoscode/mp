'use strict';

var es = require('event-stream');

module.exports = function netCompressor(player, mp) {
    function getEntOf(packet) {
        var [type, ...args] = packet;
        if (type === 'add') { return mp.entityById(args[1].id) }
        else if (typeof args[0] === 'number') { return mp.entityById(args[0]) }
    }
    var entitiesClientKnowsOf = new Set();
    return es.through(function write(data) {
        var ent = getEntOf(data);
        var passThrough = (!ent
             || ent.solid
             || ent instanceof mp.Explosion
             || ent instanceof mp.Bullet
             || ent === player);

        if (passThrough) { return this.emit('data', data) }

        if (entitiesClientKnowsOf.has(ent)) {
            if (ent.collide({
                    center: player.center,
                    size: { x: 160, y: 160 }})) {
                return this.emit('data', data);
            } else {
                entitiesClientKnowsOf.delete(ent);
                return this.emit('data', ['remove', ent.id]);
            }
        } else {
            if (ent.collide({
                    center: player.center,
                    size: { x: 160, y: 160 }})) {
                entitiesClientKnowsOf.add(ent);
                this.emit('data', ent.createAddPacket());
                if (data[0] === 'add') { return; }  // Already adding the player
                return this.emit('data', data);
            } else {
                entitiesClientKnowsOf.delete(ent);
                return this.emit('data', ['remove', ent.id]);
            }
        }
    })
}

