;(function(){
'use strict'

if (typeof document === 'undefined') { return; }


var Promise = typeof Promise === 'function' ? Promise : require('es6-promise').Promise


var all = {};

function flippable(img) {
    var flipped
    Object.defineProperty(img, 'flipped', {
        get: function() {
            if (flipped) return flipped;
            var canvas = document.createElement('canvas')
            canvas.height = img.height
            canvas.width = img.width
            var ctx = canvas.getContext('2d')
            ctx.scale(-1, 1)
            ctx.drawImage(img, -canvas.width, 0)
            return flipped = canvas
        }
    })
}

var promises = []

function image(name, path, opt) {
    opt = opt || {}
    var sync = opt.sync || false
    var img = new Image()

    var promise = new Promise(function (resolve, reject) {
        img.src = path
        img.addEventListener('load', () => resolve(img))
        img.addEventListener('error', (e) => reject(e))
        setTimeout(() => reject(new Error('Could not load image ' + path)), 5000)
    })

    if (sync) {
        promises.push(promise)
    }

    flippable(img)
    exports[name] = { img: null }
    promise.then(() => { exports[name].img = img })
    all[name] = path
}

exports.all = all

exports.allLoaded = function () {
    return Promise.all(promises)
}

image('tutorial', '/tutorial.png', { sync: true })

image('stickman', '/stickman.png')
image('stickmanRed', '/stickman-red.png')
image('stickmanBlue', '/stickman-blue.png')
image('stickmanGray', '/stickman-gray.png')
image('barrel', '/barrel.png')
image('pointRed', '/point-red.png')
image('pointBlue', '/point-blue.png')
image('baseRed', '/base-red.png')
image('ammoDrop', '/ammo-drop.png')
image('BODYSLAM', '/BODY-SLAM-ammo-drop.png')
image('baseBlue', '/base-blue.png')
image('quadcopterBlue', '/quadcopter-blue.png')
image('quadcopterRed', '/quadcopter-red.png')
image('bigQuadcopterBlue', '/quadcopter-blue-big.png')
image('bigQuadcopterRed', '/quadcopter-red-big.png')
image('largeBlock', '/large-block.png')
image('box', '/box.png')
image('bg', '/bg.png', { sync: true })
image('grass', '/grass.png', { sync: true })

}())
