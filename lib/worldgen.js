
var mersenneTwister = require('random-js').engines.mt19937
var assert = require('assert')

module.exports = function worldGen({ mp, range, seed, density, stackProbability, classes, statics }) {
    seed = seed || 42
    density = density || 0.5
    stackProbability = stackProbability || 0.3
    classes = classes || ['SmallBlock', 'SmallBlock', 'LargeBlock', 'Barrel']
    range = range || mp.range


    // Clean entities
    var oldEntities = [].slice.call(mp.entities)
    mp.entities.length = 0

    // Circular dep
    var vec = require('./mp').vec

    assert(density < 1 && density > 0)

    var randomGenerator = mersenneTwister()
    randomGenerator.seed(seed)

    var randInt = () => Math.abs(randomGenerator()) % 127

    var entities = mp.entities
    var [rangeStart, rangeEnd] = range;

    var rand = () => randInt() / 127

    var choose = (arr) =>
        arr[Math.abs(randomGenerator()) % arr.length]

    var newEnts = []
    
    var place = (className, pos, yPos) => {
        var Class = typeof className === 'string' ?
            mp[className] :
            className

        var ent = new Class()
        // Place it above ground
        ent.center = vec({
            x: pos,
            y: (typeof yPos == 'undefined' ? 100 : yPos) - (ent.size.y / 2)
        })

        if (entities.collidingWith(ent, {
                worldgenUntouchable: true }).length) {
            return
        }

        if (ent.static) {
            // The server won't send static ents to the client
            ent.syncable = false
        }
        // And the client won't recreate dynamic entities
        if (!ent.static && statics) { return; }
        entities.push(ent)
        return ent
    }

    if (mp.worldGen) {
        mp.worldGen({ range, place, statics })
    }

    var cur = rangeStart
    var count = 0

    for (var cur = rangeStart; cur < rangeEnd; cur += density * randInt()) {
        count++
        var ent = place(choose(classes), cur)
        if (ent && ent.static) {
            var stacks = rand()
            while (stacks < stackProbability && ent && ent.static) {
                ent = place(choose(classes),
                    ent.left + (rand() * ent.size.x),
                    ent.top)

                stacks += rand()
            }
        }
    }

    for (var oldEnt of oldEntities) {
        mp.entities.push(oldEnt)
    }

    if (!mp.worldGenInfo) mp.worldGenInfo = []
    mp.worldGenInfo.push({ range, seed, density, classes })

    console.log('worldgen: ', count, 'entities generated')
}
