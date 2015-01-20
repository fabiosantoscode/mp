'use strict';

var assert = require('assert');
var es = require('event-stream');

module.exports = function makeNetCompressor(player, mp) {
    function getEntOf(packet) {
        var [type, ...args] = packet;
        if (type === 'add') { return mp.entityById(args[1].id) }
        else if (typeof args[0] === 'number') { return mp.entityById(args[0]) }
    }
    function recalc() {
        var nearPlayer = {
            center: player.center,
            size: { x: 250, y: 250 }
        };
        mp.entities.collidingWith(nearPlayer,
            { static: false },
            function (ent)
        {
            if (/* passThrough */!ent
             || ent.static
             || ent instanceof mp.Explosion
             || ent instanceof mp.Bullet
             || ent === player) {
                return true;
            }
            if (!entitiesClientKnowsOf.has(ent)) {
                entitiesClientKnowsOf.add(ent);
                netCompressor.emit(ent.createAddPacket());
            }
            return true;
        });
        var x = 0
        for (var ent of entitiesClientKnowsOf) {
            x++;
            if (!ent.collide(nearPlayer)) {
                entitiesClientKnowsOf.delete(ent);
                netCompressor.emit(['remove', ent.id]);
            }
        }
        setTimeout(recalc, 500 + (Math.random() * 100));
    }
    setTimeout(recalc, 150);
    var entitiesClientKnowsOf = new Set();
    var netCompressor = es.through(function write(data) {
        var ent = getEntOf(data);
        var passThrough = (!ent
             || ent.static
             || ent instanceof mp.Explosion
             || ent instanceof mp.Bullet
             || ent === player);

        if (data[0] === 'remove') {
            // Avoid a memory leak
            entitiesClientKnowsOf.delete(ent);
            passThrough = true;
        }

        if (passThrough) { return this.emit('data', data) }

        var inPlayerVicinity = ent.collide({
            center: player.center,
            size: { x: 250, y: 250 }
        });

        var toEmit = data;

        if (inPlayerVicinity && !entitiesClientKnowsOf.has(ent)) {
            this.emit('data', ent.createAddPacket());
        } else if (!inPlayerVicinity && !entitiesClientKnowsOf.has(ent)) {
            return;
        }

        assert(toEmit);

        this.emit('data', toEmit);
    })
    return netCompressor;
}

