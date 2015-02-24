

module.exports = function weaponInfo(player, { weaponInfoDiv }) {
    var ammoSpan = weaponInfoDiv.querySelector('.weapon-ammo')
    var typeSpan = weaponInfoDiv.querySelector('.weapon-type')

    function setPack(pack) {
        if (!pack || pack.bullet.name === 'MortarBullet') {
            ammoSpan.textContent = '8'
            ammoSpan.style.transform = 'rotate(90deg)'
            typeSpan.textContent = 'Mortar'
            return
        }
        ammoSpan.style.transform = null
        ammoSpan.textContent = pack.count
        typeSpan.textContent = pack.bullet.displayName || pack.bullet.name
    }

    setPack()

    player.on('weapon-info-change', setPack)
}

