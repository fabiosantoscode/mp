'use strict'

var assert= require('assert')
var audio = require('./audio')

module.exports = function addSounds({ mp }) {
    if (!audio.supported) { return; }

    // Even if the player dies, we play sounds around them and they need a volume
    var lastLocalPlayerX
    var entToVolume = (ent) => {
        if (!mp.localPlayer && !lastLocalPlayerX) return null;
        if (mp.localPlayer) lastLocalPlayerX = mp.localPlayer.center.x
        var xDist = Math.abs(ent.center.x - lastLocalPlayerX)
        var invDist = (200 - xDist)
        if (xDist > 50) invDist /= 2
        var vol = (invDist) / (200)
        if (vol > 1) vol = 1
        if (vol < 0.1) return null
        return vol;
    }

    var soundAt = (sound, ent) => {
        assert(ent)
        var vol = entToVolume(ent)
        if (vol != null) {
            return sound(vol)
        }
        return undefined
    }

    mp.networld.on('packet:pickedUp', (sEnt) => {
        soundAt(audio.pickup, sEnt)
    })

    mp.entities.on('add', (ent) => {
        if (ent instanceof mp.Player ||
                (mp.BluePlayer && ent instanceof mp.BluePlayer) ||
                (mp.RedPlayer && ent instanceof mp.RedPlayer)) {
            ent.on('jump', () => {
                soundAt(audio.jump, ent)
            })
        }

        if (ent instanceof mp.Explosion) {
            soundAt(audio.explosion, ent)
        }
        if (ent instanceof mp.BodySlam) {
            // audio.explosion(0.2)
            var aud = soundAt(audio.bodyslam, ent)
            if (aud == null) { return }
            ent.on('update', function setVolume() {
                var vol = entToVolume(ent)
                if (vol == null) {
                    aud.stop()
                    ent.removeListener('update', setVolume)
                    return
                }
                aud.volume = vol
            })
        }
        if (ent instanceof mp.MortarBullet || ent instanceof mp.BazookaBullet) {
            soundAt(audio.mortarbullet, ent)

            var onceBump
            var solidsTouched = {}
            ent.on('bump', onceBump = function onceBump({ collidingWithMe }) {
                var anySolid = false
                for (var c of collidingWithMe)
                    if (c.solid && !solidsTouched[c.id]) {
                        solidsTouched[c.id] = true;
                        anySolid = true;
                        break;
                    }
                if (!anySolid) { return }
                var vol = entToVolume(ent)
                if (vol == null) { return; }

                audio.metalbump(vol)
            })

            ent.once('die', () => { ent.removeListener('bump', onceBump) })
        }
    })
}

