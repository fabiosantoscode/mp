'use strict';

var path = require('path');
var http = require('http');
var url = require('url');
var fs = require('fs');

var ws = require('ws');
var es = require('event-stream');
var serveBrowserify = require('./serve-browserify.js')
var websocketStream = require('websocket-stream');
var ecstatic = require('ecstatic');
var connect = require('connect');
var traceurRequire = require('traceur/src/node/require.js');

traceurRequire.makeDefault(function (filename) {
    // Files in ./lib are es6
    return !/node_modules/.test(filename)
})

var makeClockSync = require('./lib/clock-sync')
var worldGen = require('./lib/worldgen.js')
var makeCompressor = require('./lib/netcompressor.js')
var makeCapturePoint = require('./lib/capture-point.js')
var makeMp = require('./lib/mp.js')
var makeMain = require('./lib/main.js')

var TPS = 24  // ticks per second
var DEBUG = process.argv.indexOf('--debug') !== -1

var rooms = {}

var app = connect();



app.use(require('compression')())
app.use('/presentationbundle.js', serveBrowserify('./lib/presentation.js'))
app.use('/roomsbundle.js', serveBrowserify('./lib/rooms.js'))
app.use('/clientbundle.js', serveBrowserify('./lib/client.js', true /* precache */))
app.use('/spectatebundle.js', serveBrowserify('./lib/spectate.js'))
app.use('/multiplayertestbundle.js', serveBrowserify('./lib/multiplayertest.js'))
app.use('/singleplayerbundle.js', serveBrowserify('./lib/singleplayer.js'))
app.use('/test/testbundle.js', serveBrowserify('./test/tests.js'))

app.use('/', function (req, res, next) {
    if (url.parse(req.url).pathname !== '/') return next()
    res.setHeader('content-type', 'text/html;charset=utf-8')
    res.end(fs.readFileSync(path.join(__dirname, 'public', 'rooms.html')))
})

app.use('/room/', function (req, res) {
    res.setHeader('content-type', 'text/html;charset=utf-8')
    if (rooms['/room' + url.parse(req.url).pathname] === undefined || !req.url) {
        res.status = 404
        res.end('<h1>404 room not found')
        return
    }
    res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')))
})

app.use('/api/', require('./api')(rooms))

app.use('/test', ecstatic({
    root: path.join(__dirname, 'test'),
}));

app.use('/spectate', function (req, res) {
    res.setHeader('content-type', 'text/html;charset=utf-8')
    res.end(fs.readFileSync(path.join(__dirname, 'public', 'spectate.html')))
})

app.use('/', ecstatic({
    root: path.join(__dirname, 'public'),
}));

var port = +(process.argv[2] || '8080')
var server = http.createServer(app)
    .listen(port)
    .on('listening', function () {
        console.log('listening on port ' + port)
    });

var webSocketServer = new ws.Server({ server: server })

rooms['/room/main'] = createRoom()
rooms['/room/main2'] = createRoom()
rooms['/room/main3'] = createRoom()
rooms['/room/main4'] = createRoom()
rooms['/room/main5'] = createRoom()


function createRoom() {
    var mp = makeCapturePoint({
        mp: makeMp()
    })
    var networld = new mp.Networld({ isServer: true })
    var main = makeMain({
        networld: networld,
        isServer: true,
        mp: mp,
        camera: null,
        debugInfo: DEBUG === true,
    })
    worldGen({ mp: mp })
    var players = 0

    return Object.freeze({
        addPlayer: function (socket) {
            var player
            var playerWs

            main.createReadStream()
                .pipe(makeCompressor(function () { return player }, mp))
                .pipe(es.mapSync(function (data)  {
                    return data[0] === 'set3d' ?
                        [+new Date()].concat(data) :
                        data
                }))
                .pipe(es.mapSync(function (data) {
                    return new Buffer(JSON.stringify(data) + '\n' , 'utf-8')}))
                .pipe(socket)

            var inputsStream = socket.pipe(es.parse())

            players++;

            function respawn() {
                var PlayerClass = mp.getPlayerClass()
                if (player) {
                    mp.entities.remove(player)  // Just in case he's there
                }
                if (playerWs) {
                    playerWs.destroy()
                }
                player = new PlayerClass()
                player.center = mp.getSpawnPoint(player)
                mp.entities.push(player)

                socket.write(JSON.stringify([
                    'you', PlayerClass.name, player.serialize()]) + '\n')

                setTimeout(function func() {
                    if (player.dead) return respawn()
                    setTimeout(func, 1000)
                })

                inputsStream.pipe((playerWs = player.createWriteStream()))
            }

            respawn()

            require('./lib/push-player-position.js')(function () { return player }, socket)

            socket.on('close', function disconnectPlayer() {
                players--
                mp.entities.remove(player)
            })
        },
        addSpectator: function (socket) {
            main.createReadStream()
                .pipe(es.stringify())
                .pipe(es.mapSync(function(data) { return data + '\n' }))
                .pipe(socket)
        }
    })
}

webSocketServer.on('connection', function (ws) {
    var socketStream = websocketStream(ws)

    var roomName = url.parse(ws.upgradeReq.url).pathname
    var isSpectate = /^\/spectate/.test(roomName)
    roomName = roomName.replace(/^\/spectate/, '')
    roomName = roomName.replace(/^\/|\/$/g, '')
    roomName = '/' + roomName

    var room = rooms[roomName]

    if (!room) {
        socketStream.end()
        return
    }

    if (isSpectate) {
        room.addSpectator(socketStream)
    } else {
        room.addPlayer(socketStream)
    }

    makeClockSync(socketStream, { server: true })

    socketStream.on('error', function () { socketStream.end() })
});

