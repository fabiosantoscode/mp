'use strict'

// Keep some Audio instances, so they don't get garbage collected
var preloads = {}

var audioSupport =
module.exports.supported =
typeof Audio !== 'undefined'

var effect = (name, source) => {
    source = source || '/' + name + '.wav'
        + '?' + Math.random()

    if (audioSupport)
        preloads[name] = new Audio(source)

    module.exports[name] = (volume) => {
        if (!audioSupport) { return; }
        if (preloads[name] && preloads[name].paused === true) {
            var snd = preloads[name]
        } else {
            var snd = preloads[name].cloneNode(true)
        }
        if (volume != null) {
            snd.volume = volume
        }
        snd.play()
        return snd
    }
}

effect('explosion')
effect('bodyslam')
effect('mortarbullet')
effect('metalbump')
effect('jump')
effect('pickup')

