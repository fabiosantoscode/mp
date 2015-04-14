'use strict';

module.exports = function weaponInfo(player, { weaponInfoDiv }) {
    var ammoSpan = weaponInfoDiv.querySelector('.weapon-ammo')
    var typeSpan = weaponInfoDiv.querySelector('.weapon-type')

    function setPack(pack) {
        if (!pack || (
                pack && pack.bullet && pack.count === -1)) {
            ammoSpan.textContent = '8'
            ammoSpan.style.transform = 'rotate(90deg)'
            typeSpan.textContent = 'Mortar'
            return
        }
        ammoSpan.style.transform = null
        if (pack === 'dead') {
            ammoSpan.textContent = ''
            typeSpan.textContent = ''
            return
        }
        ammoSpan.textContent = pack.count
        typeSpan.textContent = pack.bullet.displayName || pack.bullet.name
    }

    setPack()

    player.on('weapon-info-change', setPack)

    var onRemove
    player.on('remove', onRemove = function () {
        player.removeListener('weapon-info-change', setPack)
        setPack('dead')
    })

    return {
        destroy: () => {
            player.removeListener('weapon-info-change', setPack)
            player.removeListener('remove', onRemove)
        }
    }
}

