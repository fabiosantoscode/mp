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

function image(name, path) {
    var img = exports[name] = new Image()

    promises.push(new Promise(function (resolve, reject) {
        img.addEventListener('load', () => resolve(img))
        img.addEventListener('error', (e) => reject(e))
        setTimeout(() => reject(new Error('Could not load image ' + path)), 5000)
    }))

    flippable(img)
    exports[name].src = path
    all[name] = path
}

exports.all = all

exports.allLoaded = function () {
    return Promise.all(promises)
}

image('stickman', '/stickman.png')
image('stickmanRed', '/stickman-red.png')
image('stickmanBlue', '/stickman-blue.png')
image('stickmanGray', '/stickman-gray.png')
image('barrel', '/barrel.png')
image('pointRed', '/point-red.png')
image('pointBlue', '/point-blue.png')
image('baseRed', '/base-red.png')
image('ammoDrop', '/ammo-drop.png')
image('baseBlue', '/base-blue.png')
image('quadcopterBlue', '/quadcopter-blue.png')
image('quadcopterRed', '/quadcopter-red.png')
image('bigQuadcopterBlue', '/quadcopter-blue-big.png')
image('bigQuadcopterRed', '/quadcopter-red-big.png')
image('largeBlock', '/large-block.png')
image('box', '/box.png')
image('bg', '/bg.png')

}())
