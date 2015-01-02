
if (typeof Image === 'undefined') {
    return;  // We're in node.js, don't attempt to create images
}

var all = {};

function image(name, path) {
    var img = exports[name] = new Image()
    exports[name].src = path
    all[name] = path
}

exports.all = all

image('stickman', 'stickman.png')

