
var es = require('event-stream')
var http = require('http')

var FEW_ROOMS = '/api/rooms/few'
var eIfrContainer = document.body


// <3 https://gist.github.com/JosePedroDias/2d4bf89ccb4e5aaee9a4
var ajax = function(o) {
    var xhr = new XMLHttpRequest();
    if (o.creds) { xhr.withCredentials = true; }
    xhr.open(o.verb || 'GET', o.uri, true);
    var cbInner = function() {
        if (xhr.readyState === 4 && xhr.status > 199 && xhr.status < 300) {
            return o.cb(null, JSON.parse(xhr.response));
        }
        o.cb('error requesting ' + o.uri);
    };
    xhr.onload = cbInner;
    xhr.onerror = cbInner;
    xhr.send(o.payload || null);
};

var rooms = new Promise(function (resolve, reject) {
    ajax({ uri: FEW_ROOMS, cb: function (err, rooms) {
        if (err) reject(err)
        if (!rooms) return reject(new Error('No rooms have been found'))
        resolve(rooms.filter(function (room) { return /^\/room\//.test(room) }))
    } })
})

function makeRoomView(room) {
    var eIfr = document.createElement('iframe')
    var eWrap = document.createElement('div')
    var ePlay = document.createElement('a')
    eIfr.setAttribute('src', '/spectate' + room)
    eWrap.className = 'homepage-spectate'
    ePlay.className = 'playbtn'
    ePlay.href = room

    ePlay.textContent = room + '\n» Play'

    ePlay.onclick = function() { ePlay.className += ' going' }

    eWrap.appendChild(eIfr)
    eWrap.appendChild(ePlay)
    return eWrap
}

rooms.then(function (rooms) {
    console.log('found rooms: ', rooms)
    var iframes = rooms.map(makeRoomView)

    iframes.forEach(function (eIfr) {
        eIfrContainer.appendChild(eIfr)
    })

    iframes.forEach(function (eIfr) {
        eIfr.onclick = console.log.bind(console)
    })
})



