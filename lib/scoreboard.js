'use strict'

var events = require('events')

module.exports = function ({ mp, scoreboardElement, scoreboardToggleElement }) {
    var scoreboard = new events.EventEmitter()
    var table = {}

    var isOpen = true

    scoreboard.on('update', function() {
        if (isOpen) update()
    })

    if (mp.isServer) {
        var isPlayer = (ent) => !!ent && (ent instanceof mp.Player) && ('playerId' in ent)
        scoreboard.add = (playerId) => { table[playerId] = 0; push() }
        mp.on('kill', function (ev) {
            if (!isPlayer(ev.killer)) return;
            if (!isPlayer(ev.entity)) return;
            table[ev.killer.playerId]++;
            push()
        })
        scoreboard.remove = (playerId) => { delete table[playerId]; push() }

        var push = () => {
            if (mp.destroyed) return;
            mp.pushGlobalChange('new-table', table)
        }
    } else {
        mp.networld.on('packet:new-table', ([remoteTable]) => {
            table = remoteTable
            update()
        })
    }

    function update() {
        if (!(typeof document !== 'undefined' && scoreboardElement)) { return console.log('score update:', table) }
        scoreboardElement.innerHTML = ''
        var tblEl = document.createElement('table')
        var headers = tblEl.appendChild(document.createElement('thead'))
        headers = headers.appendChild(document.createElement('tr'))
        headers.appendChild(document.createElement('th')).textContent = 'Player'
        headers.appendChild(document.createElement('th')).textContent = 'Score'
        Object.keys(table)
            .sort((a, b) => table[a] > table[b] ? 1 :
                table[b] < table[a] ? -1 :
                0)
            .map(playerId => {
                var row = document.createElement('tr')
                var col1 = row.appendChild(document.createElement('td'))
                var col2 = row.appendChild(document.createElement('td'))
                col1.textContent = playerId
                col2.textContent = table[playerId]
                return row
            })
            .forEach(row => tblEl.appendChild(row))

        scoreboardElement.appendChild(tblEl)
    }

    function open() {
        isOpen = true
        scoreboardElement.hidden = false
        update()
    }

    function close() {
        isOpen = false
        scoreboardElement.hidden = true
    }

    if (scoreboardToggleElement) {
        scoreboardToggleElement.addEventListener('click', () => {
            if (isOpen) close(); else open()
        })
        document.addEventListener('keydown', (ev) => {
            if (ev.which === 9 /* TAB */ && !isOpen) {
                open()
                ev.preventDefault()
            }
        })
        document.addEventListener('keyup', (ev) => {
            if (ev.which === 9 /* TAB */ && isOpen) {
                close()
                ev.preventDefault()
            }
        })

        document.addEventListener('click', (ev) => {
            if (ev.target === scoreboardToggleElement) return;
            if (isOpen) close()
        })

        isOpen = false
    }

    return scoreboard
}

