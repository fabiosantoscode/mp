
var vec = require('./mp').vec

module.exports = function setUpRandomDrops({ mp }) {
    var AmmoDrop = mp.AmmoDrop

    function dropIt() {
        var [start, end] = mp.range

        if (Math.random() > 0.4) { return }

        var place = (Math.random() * (end - start)) + start

        if (mp.entities.collidingWith({
                center: { x: place, y: 0 },
                size: { x: 10, y: 50 }
            }, {
                instanceof: AmmoDrop
            }).length
        ) { return } 

        var ammoDrops = mp.entities.filter(ent => ent instanceof AmmoDrop).length

        if (ammoDrops > 10) { return }

        var possibleDrops = Object.keys(mp).map(k => mp[k])
            .filter(cls => typeof cls == 'function')
            .filter(cls => cls !== mp.MortarBullet)
            .filter(cls => cls.prototype && cls.prototype instanceof mp.Bullet)

        var drop = new AmmoDrop({
            count: Math.floor(Math.random() * 10) + 1,
            bullet: possibleDrops[
                Math.floor(Math.random() * possibleDrops.length) ]
        })

        var iters = 0
        var y = 0
        do {
            drop.center = vec({ x: place, y: y })
            y++
            iters++
        } while (!drop.grounded() && iters < 100)

        mp.entities.push(drop)
    }

    var stop = false
    setTimeout(function loop() {
        if (stop) { return }
        if (!mp.isServer) { return; }

        dropIt()
        setTimeout(loop, 10000)
    }, 5000)

    return {
        destroy: () => {
            stop = true
        }
    }
}

