'use strict'

var FEW_ROOMS = '/api/rooms/few'
var eIfrContainer = document.querySelector('#multiplayer-rooms')
var gameNameElement = document.querySelector('#gamename')
var greetingElement = document.querySelector('#greeting')

var Promise = typeof Promise === 'function' ? Promise : require('es6-promise').Promise

var gameName = require('./gamename')


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

eIfrContainer.textContent = 'loading'
eIfrContainer.classList.add('loading')

rooms.then(function (rooms) {
    var iframes = rooms.map(makeRoomView)

    eIfrContainer.textContent = ''
    eIfrContainer.classList.remove('loading')

    iframes.forEach(function (eIfr) {
        eIfrContainer.appendChild(eIfr)
    })
})

if (gameNameElement) {
    gameNameElement.focus()
    gameName.bind(gameNameElement)
    gameNameElement.value = gameName.get()
}

if (greetingElement) {
    gameName.subscribe(name => {
        if (name) {
            greetingElement.textContent = 'Hello ' + name + '!';
        } else {
            greetingElement.textContent = '';
        }
    })
}

