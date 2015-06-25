'use strict'

var panel = require('./ui-panel')
var fullscreen = require('./fullscreen')
var localStorage = (typeof window !== 'undefined' && window.localStorage) || {}

module.exports = function settings({ settingsButton, settingsPanel }) {
    var panelUi = panel({ button: settingsButton, panel: settingsPanel })

    document.addEventListener('keydown', (ev) => {
        if (ev.which !== 27 /* ESC */) { return }

        if (panelUi.isOpen()) {
            panelUi.close()
        } else {
            panelUi.open()
        }

        ev.preventDefault()
    })

    var muteAction
    var actions = [
        ['change game name', () => {
            var newName = prompt('WHAT\'S YOUR NAME GOING TO BE?')
            if (newName) require('./gamename').set(newName)
        }],
        (muteAction = ['mute sounds', ({ button }) => {
            var isNowMute = localStorage.mute === 'false'

            require('./audio').mute = isNowMute
            localStorage.mute = isNowMute + ''
            button.textContent = isNowMute ? 'play sounds' : 'mute sounds'
        }]),
        ['back to lounge', () => {
            location.assign('/')
        }],
    ]

    if (fullscreen) {
        actions.push(['toggle fullscreen', () => {
            if (fullscreen.target()) {
                fullscreen.release()
            } else {
                fullscreen.request()
            }
        }])
    }

    if (localStorage.mute === 'true') {
        muteAction[0] = 'play sounds'
    }

    actions.forEach(([name, cb]) => {
        var button = document.createElement('button')
        button.type = 'button'
        button.textContent = name
        button.onclick = () => {
            cb({ button, name })
        }
        settingsPanel.appendChild(button)
    })
}
