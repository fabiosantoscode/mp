'use strict'

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

    mp.entities.on('add', (ent) => {
        var vol = entToVolume(ent);

        if (vol == null) return

        if (ent instanceof mp.Explosion) {
            audio.explosion(vol)
        }
        if (ent instanceof mp.BodySlam) {
            // audio.explosion(0.2)
            var aud = audio.bodyslam(vol)
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
            audio.mortarbullet(vol)
        }
    })
}

