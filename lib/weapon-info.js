'use strict';

module.exports = function weaponInfo(player, { weaponInfoDiv }) {
    var ammoSpan = weaponInfoDiv.querySelector('.weapon-ammo')
    var typeSpan = weaponInfoDiv.querySelector('.weapon-type')
    var img = weaponInfoDiv.querySelector('.weapon-img')

    var prevPack = null
    function setPack(pack) {
        if (img && pack && pack.bullet && pack.bullet.dropImage) {
            var thisPack = pack
            if (thisPack !== prevPack) {
                img.src = pack.bullet.dropImage.img.src
                img.hidden = true
                var x = img.offsetWidth // Read the DOM
                img.hidden = false
            }
            prevPack = thisPack
        } else if (img) {
            img.hidden = true
        }
        
        if (!pack || (
                pack && pack.bullet && pack.count === -1)) {
            ammoSpan.textContent = '8'
            typeSpan.textContent = 'Mortar'
            ammoSpan.style.transform = 'rotate(90deg)'
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

    // TODO why?
    setTimeout(() => {
        setPack()
        player.on('weapon-info-change', setPack)
    }, 1000)

    return {
        destroy: () => {
            player.removeListener('weapon-info-change', setPack)
            setPack('dead')
        }
    }
}

