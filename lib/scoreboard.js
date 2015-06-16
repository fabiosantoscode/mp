'use strict'

var events = require('events')
var panel = require('./ui-panel')

module.exports = function ({ mp, scoreboardElement, scoreboardToggleElement }) {
    var scoreboard = new events.EventEmitter()
    var table = {}

    if (mp.isServer) {
        var isPlayer = (ent) => !!ent && (ent instanceof mp.Player) && ('playerId' in ent)
        scoreboard.add = (playerId) => {
            table[playerId] = [0,-1];
            var player = mp.entities.byId(playerId)
            if (player && player.team) {
                table[playerId].push(player.team.color)
            }
            push()
        }
        mp.on('kill', function (ev) {
            if (!isPlayer(ev.killer)) return;
            if (!isPlayer(ev.entity)) return;
            console.log('FIRST BLOOD')
            table[ev.killer.playerId][0]++;
            push()
        })
        scoreboard.remove = (playerId) => { delete table[playerId]; push() }

        scoreboard.setName = (playerId, name) => {
            if (table[playerId])
                table[playerId][1] = name
            push()
        }

        var push = () => {
            if (mp.destroyed) return;
            mp.pushGlobalChange('new-table', table)
        }

        return scoreboard;
    }

    if (typeof document === 'undefined') {
        // A node client
        return scoreboard;
    }

    mp.networld.on('packet:new-table', ([remoteTable]) => {
        table = remoteTable
        update()
    })

    function update() {
        if (!(typeof document !== 'undefined' && scoreboardElement)) { return console.log('score update:', table) }
        scoreboardElement.innerHTML = ''
        var keys = Object.keys(table)
        if (keys.length === 0) return;

        var addTeam = table[keys[0]].length > 2

        function create(parent, tagName) {
            return parent.appendChild(
                document.createElement(tagName)
            )
        }

        var tblEl = document.createElement('table')
        tblEl.cellSpacing = 0
        var headers = create(tblEl, 'thead')
        headers = create(headers, 'tr')
        create(headers, 'th').textContent = 'Player'
        create(headers, 'th').textContent = 'Score'
        if (addTeam)
            create(headers, 'th').textContent = 'Team'
        Object.keys(table)
            .filter(key => !!table[key])
            .sort((a, b) => table[a][0] > table[b][0] ? 1 :
                table[b][0] < table[a][0] ? -1 :
                0)
            .map(playerId => {
                if (!table[playerId]) { return null }
                var row = document.createElement('tr')
                var col1 = create(row, 'td')
                var col2 = create(row, 'td')
                col1.textContent = table[playerId][1] === -1 ?
                    playerId : table[playerId][1]
                col2.textContent = table[playerId][0]
                if (addTeam) {
                    var team = table[playerId][2]
                    if (team) {
                        var col3 = create(row, 'td')
                        col3.textContent = table[playerId][2] || ''
                        row.className = 'player-in-team-' + team
                    }
                }
                return row
            })
            .filter(row => row !== null)
            .forEach(row => tblEl.appendChild(row))

        scoreboardElement.appendChild(tblEl)
    }

    scoreboard.on('update', function() {
        if (scoreboardPanel.isOpen()) update()
    })

    var scoreboardPanel = panel({
        button: scoreboardToggleElement,
        panel: scoreboardElement
    })

    scoreboardPanel.on('open', function () {
        update()
    })

    document.addEventListener('keydown', (ev) => {
        if (ev.which === 9 /* TAB */) {
            if (!scoreboardPanel.isOpen()) scoreboardPanel.open()
            ev.preventDefault()
        }
    })
    document.addEventListener('keyup', (ev) => {
        if (ev.which === 9 /* TAB */) {
            if (scoreboardPanel.isOpen()) scoreboardPanel.close()
            ev.preventDefault()
        }
    })

    return scoreboard
}

