'use strict'

// Keep some Audio instances, so they don't get garbage collected
var preloads = {}

var audioSupport =
module.exports.supported =
typeof Audio !== 'undefined'

var effect = (name, source) => {
    source = source || '/' + name + '.wav'

    if (audioSupport)
        preloads[name] = new Audio(source)

    module.exports[name] = (volume) => {
        if (!audioSupport) { return; }
        var snd = new Audio(source)
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

