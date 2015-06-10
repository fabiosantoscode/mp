'use strict';

var assert = require('assert');
var es = require('event-stream');

module.exports = function makeNetCompressor(player, mp) {
    function getEntOf(packet) {
        var type = packet[0];
        var args = packet.slice(1);
        if (type === 'add') { return mp.entityById(args[1].id) }
        else if (typeof args[0] === 'number') { return mp.entityById(args[0]) }
    }

    function getPlayer() {
        return typeof player == 'function' ? player() : player
    }

    var stop = false
    function recalc() {
        if (stop) { return }
        var player = getPlayer();
        if (player && !player.dead) {
            var nearPlayer = {
                center: player.center,
                size: { x: 250, y: 500 }
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
                    netCompressor.emit('data', ent.createAddPacket());
                }
                return true;
            });
            for (var ent of entitiesClientKnowsOf) {
                if (!ent.collide(nearPlayer) && !ent.ephemeral) {
                    entitiesClientKnowsOf.delete(ent);
                    netCompressor.emit('data', ['remove', ent.id]);
                }
            }
        }
        setTimeout(recalc, 500 + (Math.random() * 100));
    }
    // TODO do a recalc when the player moves a certain %-of-viewport amount instead.
    setTimeout(recalc, 150);
    var entitiesClientKnowsOf = new Set();

    var netCompressor = es.through(function write(data) {
        var player = getPlayer();
        if (!player) { return; }

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
            size: { x: 250, y: 500 }
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

    netCompressor.destroy = function () {
        stop = true
    }

    return netCompressor;
}

