'use strict';

var assert = require('assert');
var es = require('event-stream');

module.exports = function makeNetCompressor(player, mp) {
    function getEntOf(packet) {
        if (typeof packet[0] === 'string') {
            var type = packet[0];
            var args = packet.slice(1);
        } else if (typeof packet[0] === 'number') {
            var type = packet[1]
            var args = packet.slice(2)
        }
        if (type === 'add') { return mp.entityById(args[1].id) }
        else if (typeof args[0] === 'number') { return mp.entityById(args[0]) }
    }

    function getPlayer() {
        return typeof player == 'function' ? player() : player
    }

    function isPassThrough(ent) {
        return (!ent
             || ent.static
             || ent instanceof mp.Explosion
             || ent instanceof mp.Bullet
             || ent === player
             || (mp.Point && (ent instanceof mp.Point))
             || (mp.Base && (ent instanceof mp.Base)))
    }

    var stop = false
    function recalc() {
        if (stop) { return }
        var player = getPlayer();
        if (player && !player.dead) {
            var nearPlayer = {
                center: player.center,
                size: { x: 200, y: 1000 }
            };
            mp.entities.collidingWith(nearPlayer,
                { static: false },
                function (ent)
            {
                if (isPassThrough(ent)) {
                    return true;
                }
                if (!entitiesClientKnowsOf.has(ent)) {
                    entitiesClientKnowsOf.add(ent);
                    netCompressor.emit('data', ent.createAddPacket());
                }
                return true;
            });
            entitiesClientKnowsOf.forEach((ent) => {
                if (!ent.collide(nearPlayer) && !ent.ephemeral) {
                    entitiesClientKnowsOf.delete(ent);
                    netCompressor.emit('data', ['remove', ent.id]);
                }
            })
        }
        setTimeout(recalc, 1000 + (Math.random() * 1000));
    }
    // TODO do a recalc when the player moves a certain %-of-viewport amount instead.
    setTimeout(recalc, 150);
    var entitiesClientKnowsOf = new Set();

    var netCompressor = es.through(function write(data) {
        var player = getPlayer();
        if (!player) { return; }

        var ent = getEntOf(data);
        var passThrough = isPassThrough(ent);

        if (ent !== player && typeof data[0] === 'number') {
            data.unshift()  // Remove clientside prediction timestamps for not-predicted-in-my-client characters
        }

        if (data[0] === 'remove') {
            // Avoid a memory leak
            entitiesClientKnowsOf.delete(ent);
            passThrough = true;
        }

        if (passThrough) { return this.emit('data', data) }

        var inPlayerVicinity = ent.collide({
            center: player.center,
            size: { x: 200, y: 500 }
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

