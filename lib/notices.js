
module.exports = function (message, opt) {
    opt = opt || {}
    opt.noticeRoot = opt.noticeRoot || document.getElementById('noticeRoot') || document.body
    opt.isGood = opt.isGood == null ? true : opt.isGood

    var notice = document.createElement('div')
    notice.className = 'game-notice'
    notice.textContent = message
    if (opt.isGood) notice.classList.add('good-notice')
    opt.noticeRoot.appendChild(notice)

    return notice
}

