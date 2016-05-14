'use strict';

var assert = require('assert')
var events = require('events');
var path = require('path');
var http = require('http');
var url = require('url');
var fs = require('fs');

var ws = require('ws');
var es = require('event-stream');
var makeSanitizer = require('./lib/sanitize.js');
var serveBrowserify = require('./serve-browserify.js')
var websocketStream = require('websocket-stream');
var ecstatic = require('ecstatic');
var connect = require('connect');

var makeBotSocket = require('./lib/bot')
var makeClockSync = require('./lib/clock-sync')
var worldGen = require('./lib/worldgen.js')
var makeCompressor = require('./lib/netcompressor.js')
var makeCapturePoint = require('./lib/capture-point.js')
var makeScoreboard = require('./lib/scoreboard.js')
var makeMp = require('./lib/mp.js')
var makeMain = require('./lib/main.js')

var DEBUG = process.argv.indexOf('--debug') !== -1
var BUILD = process.argv.indexOf('--build') !== -1
var NOBROWSERIFY = process.argv.indexOf('--no-browserify') !== -1

var rooms = {}

var toBrowserify = require('./server/browserify-bundles.json')

var app = connect();

if (BUILD) {
    for (var bundleName in toBrowserify) {
        serveBrowserify.compile({
            bundleName: path.join(__dirname, 'public', bundleName),
            debug: false,
            entryPoint: toBrowserify[bundleName]
        })
    }
    process.exit(0);
}

if (!NOBROWSERIFY) {
    for (var bundleName in toBrowserify) {
        app.use(
            bundleName,
            serveBrowserify(toBrowserify[bundleName], {
                precache: DEBUG, debug: DEBUG
            }))
    }
}

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

app.use('/spectate', function (req, res) {
    res.setHeader('content-type', 'text/html;charset=utf-8')
    res.end(fs.readFileSync(path.join(__dirname, 'public', 'spectate.html')))
})

app.use('/', ecstatic({
    cache: 36000,
    root: path.join(__dirname, 'public'),
}));

var port = +(process.argv[2] || '8080')
var server = http.createServer(app)
    .listen(port)
    .on('listening', function () {
        console.log('listening on port ' + port)
    });

var webSocketServer = new ws.Server({ server: server })

rooms['/room/main'] = createRoom({ maxPlayers: 8, botFill: 4 })
rooms['/room/main2'] = createRoom({ maxPlayers: 8, botFill: 4 })
// rooms['/room/main3'] = createRoom()
// rooms['/room/main4'] = createRoom()
// rooms['/room/main5'] = createRoom()


function createRoom(opt) {
    opt = opt || {}
    var mp
    var networld
    var main
    var scoreboard
    var roomEvents = new events.EventEmitter()
    roomEvents.setMaxListeners(255)

    var bots = []

    function botFill() {
        if (!opt.botFill) { return; }

        while (players < opt.botFill) {
            var sock = makeBotSocket({ mp: mp })
            room.addPlayer(sock, { isBot: true })
            bots.push(sock)
        }

        while (bots.length !== 0 &&
                players > opt.botFill) {
            var bot = bots.pop()
            bot.disconnectPlayer()
            bot.destroy()
        }
    }

    roomEvents.on('end-round', function () {
        for (var i = 0; i < bots.length; i++) {
            bots[i].destroy()
        }
        bots.length = 0
        botFill()
    })

    var gameStartTime = +new Date()

    opt.maxPlayers = opt.maxPlayers || 24
    assert(opt.maxPlayers > 0)
    assert(opt.maxPlayers <= 255)

    var newRound = function () {
        if (mp) {
            mp.destroy()
        }
        if (networld) networld.destroy()
        if (main) main.destroy()

        mp = makeCapturePoint({
            mp: makeMp()
        })
        mp.yRange = [-50, 100]
        networld = new mp.Networld({ isServer: true })
        main = makeMain({
            networld: networld,
            isServer: true,
            mp: mp,
            camera: null,
            debugInfo: DEBUG === true,
        })
        worldGen({
            mp: mp,
            seed: Math.floor(Math.random() * 99999)
        })
        mp.askForNewRound = newRound
        roomEvents.emit('end-round')
        scoreboard = makeScoreboard({ mp: mp })
    }


    newRound()

    var playerIds = 0
    var players = 0

    var room
    return room = Object.freeze({
        players: [],
        addPlayer: function (socket, kwParams) {
            if (players + 1 > opt.maxPlayers)
                return socket.end('["fatal", "too many players"]\n')

            var playerId = ++playerIds

            kwParams = kwParams || {}

            var player
            var playerWs

            var name

            var mainStreamCompressor
            var mainRs

            players++;

            if (!kwParams.isBot) botFill()

            function newMain() {
                player = null

                if (kwParams.isBot) return;

                function replacer(_, value) {
                    return value == 'number' ?
                        Number((value+'')
                            .replace(/(-?\d+\.\d\d)\d+/g, '$1')) :
                        value
                }
                mainStreamCompressor = makeCompressor(function () { return player }, mp)
                mainRs = main.createReadStream()
                mainRs
                    .pipe(mainStreamCompressor)
                    .pipe(es.mapSync(function (data) {
                        data = JSON.stringify(data, replacer)
                        return new Buffer(data + '\n', 'utf-8')
                    }))
                    .pipe(socket)
            }

            function respawn(newPlayer) {
                if (playerWs) { playerWs.destroy() }
                if (player) { mp.entities.remove(player) }

                if (!newPlayer) {
                    var PlayerClass = mp.getPlayerClass()
                    player = new PlayerClass()
                } else {
                    player = newPlayer
                    var PlayerClass = player.constructor
                }

                player.center = mp.getSpawnPoint(player)
                player.playerId = playerId

                mp.entities.push(player)

                socket.write(JSON.stringify([
                    'you', PlayerClass.name, player.serialize()]) + '\n')

                player.once('die', function () {
                    if (mp.playerDead) mp.playerDead(player, respawn);
                    else mp.setTimeout(respawn, 1000)
                });

                socket.unpipe()
                socket.pipe(makeSanitizer())
                    .pipe(es.parse({ errors: true }))
                    .on('data', function (data) {
                        if (data[0] === 'my-name' && data[1])
                            setName(data[1])
                    })
                    .pipe((playerWs = player.createWriteStream()))
            }

            function destroy() {
                if (player) {
                    if (playerWs) {
                        playerWs.destroy()
                    }
                }

                if (mainRs) {
                    mainRs.unpipe()
                    mainRs.destroy()
                }

                if (mainStreamCompressor)
                    mainStreamCompressor.destroy()

                botFill()
            }

            newMain()
            respawn()

            scoreboard.add(playerId)

            function setName(name) {
                scoreboard.setName(playerId, name)
            }

            roomEvents.once('end-round', function thisFunc() {
                destroy()

                socket.write('["reconnect me"]\n')

                newMain()
                respawn()

                roomEvents.once('end-round', thisFunc)
            })

            var disconnected = false
            function disconnectPlayer() {
                if (disconnected) { return; }
                disconnected = true
                players--
                destroy()
                scoreboard.remove(playerId)
                if (player) { mp.entities.remove(player) }
            }

            socket.disconnectPlayer = disconnectPlayer

            socket.on('close', disconnectPlayer)
            socket.on('end', disconnectPlayer)
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

