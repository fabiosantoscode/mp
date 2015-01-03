'use strict';

var path = require('path');
var http = require('http');
var url = require('url');
var fs = require('fs');

var ws = require('ws');
var es = require('event-stream');
var websocketStream = require('websocket-stream');
var browserify = require('browserify');
var ecstatic = require('ecstatic');
var connect = require('connect');
var traceurRequire = require('traceur/src/node/require.js');

traceurRequire.makeDefault(function (filename) {
    // Files in ./lib are es6
    return !/node_modules/.test(filename)
})

var makeMp = require('./lib/mp.js')
var makeMain = require('./lib/main.js')

var TPS = 24  // ticks per second
var DEBUG = true

var app = connect();

function serveBrowserify(entryPoint) {
    return function (req, res) {
        res.setHeader('content-type', 'text/javascript; charset=utf-8')
        var b = browserify({
            entries: [entryPoint],
            debug: DEBUG
        })
        b.bundle().pipe(res)
    }
}

app.use('/clientbundle.js', serveBrowserify('./lib/client.js'))
app.use('/multiplayertestbundle.js', serveBrowserify('./lib/multiplayertest.js'))
app.use('/singleplayerbundle.js', serveBrowserify('./lib/singleplayer.js'))
app.use('/test/testbundle.js', serveBrowserify('./test/tests.js'))

app.use(ecstatic({
    root: path.join(__dirname, 'test'),
    baseDir: '/test'
}));

app.use(ecstatic({
    root: path.join(__dirname, 'public'),
    baseDir: '/'
}));

var port = +(process.argv[2] || '8080')
var server = http.createServer(app)
    .listen(port)
    .on('listening', function () {
        console.log('listening on port ' + port)
    });

var webSocketServer = new ws.Server({ server: server })

var rooms = {};

function getOrCreateRoom(path) {
    rooms['room:' + path] = rooms['room:' + path] || createRoom()
    return rooms['room:' + path]
}

function createRoom() {
    var mp = makeMp()
    var networld = new mp.Networld({ isServer: true })
    var main = makeMain({ networld: networld, isServer: true, mp: mp, player: null, camera: null })
    var players = 0

    function onFrame() {
        var howFarIntoNextFrame = main.tick()
        var howMuchForNextFrame = 1 - howFarIntoNextFrame
        var howMuchToWaitForNextFrame = howMuchForNextFrame * (1000 / TPS)
        setTimeout(onFrame, howMuchToWaitForNextFrame)
    }

    onFrame()
    return Object.freeze({
        addPlayer: function (socket) {
            main.createReadStream()
                .pipe(es.stringify())
                .pipe(socket)
            var player = new mp.Player()
            socket
                .pipe(es.mapSync(function (data) {
                    return data.toString('utf-8') }))
                .pipe(es.parse())
                .pipe(player.createWriteStream())
            mp.entities.push(player)
            players++;
        },
        removePlayer: function () {
            players--;
            if (players === 0) {
                main = null
            }
        }
    })
}

webSocketServer.on('connection', function (ws) {
    var roomName = url.parse(ws.upgradeReq.url).path
    var room = getOrCreateRoom(roomName)
    var socketStream = websocketStream(ws)
    room.addPlayer(socketStream)
});
