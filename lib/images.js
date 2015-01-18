

if (typeof document != 'undefined') {


var all = {};

var promises = []

function image(name, path) {
    var img = exports[name] = new Image()

    promises.push(new Promise(function (resolve, reject) {
        img.addEventListener('load', () => resolve(img))
        img.addEventListener('error', (e) => reject(e))
        setTimeout(() => reject(new Error('Could not load image ' + path)), 5000)
    }))

    exports[name].src = path
    all[name] = path
}

exports.all = all

exports.allLoaded = function () {
    return Promise.all(promises)
}

image('stickman', 'stickman.png')

}
