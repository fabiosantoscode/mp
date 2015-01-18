
var assert = require('assert')
var vec = require('./mp').vec

module.exports = function worldGen({ mp, range, seed = 42, density = 0.5, classes = ['SmallBlock', 'LargeBlock', 'Barrel', 'LightPost'] }) {
    assert(density < 1 && density > 0)
    var density = 1 / density;

    var entities = mp.entities
    var [rangeStart, rangeEnd] = range;

    var randInt = () => seed = (((seed + 3) * seed) % 127) + 1
    
    var rand = () => randInt() / 127

    var choose = (arr) => arr[randInt() % arr.length]

    var newEnts = []
    
    var place = (className, pos) => {
        var Class = mp[className]
        var ent = new Class()
        // Place it above ground
        ent.center = vec({
            x: pos,
            y: 100 - (ent.size.y / 2)
        })
        entities.push(ent)
    }
    
    var cur = rangeStart

    /*for (var cur = rangeStart; cur < rangeEnd; cur += rand() * density) {
        
    }*/
    
    place('SmallBlock', 0)
    place('LargeBlock', 10)
    place('Barrel', 70)
    place('SmallBlock', 90)
}