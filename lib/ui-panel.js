'use strict'

var events = require('events')

module.exports = function toggleablePanel({ button, panel }) {
    var isOpen = false

    function open() {
        isOpen = true
        panel.hidden = false
        self.emit('open')
    }

    function close() {
        isOpen = false
        panel.hidden = true
        self.emit('close')
    }

    if (button) {
        button.addEventListener('click', () => {
            if (isOpen) close(); else open()
        })
        document.addEventListener('click', (ev) => {
            if (ev.target === button) return;
            if (isOpen) close()
        })

        isOpen = false
    }

    var self = new events.EventEmitter()

    self.button = button
    self.panel = panel
    self.open = open
    self.close = close
    self.isOpen = () => isOpen

    return self
}
