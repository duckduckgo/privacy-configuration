const GREEN = '#71bf69'
const YELLOW = 'yellow'
const RED = '#f97268'
const table = document.getElementById('config-table')
const baseUrl = document.location.origin

const platforms = [
    ['Android', 'v4/android-config.json'],
    ['Extension', 'v4/extension-config.json'],
    ['macOS', 'v4/macos-config.json'],
    ['windows', 'v4/windows-config.json']
]

platforms.forEach(([name, path]) => {
    const template = document.querySelector('#config-row')
    const clone = template.content.cloneNode(true)
    const td = clone.querySelectorAll('td')
    td[0].innerText = name
    const link = clone.querySelector('a')
    link.href = `${baseUrl}/generated/${path}`
    link.innerText = path
    td[2].id = `platform_${name}_status`
    table.appendChild(clone)
})

async function updateStatus () {
    const req = await fetch('/status')
    const { lastBuild, lastHit } = await req.json()
    platforms.forEach(([name, path]) => {
        const cell = document.getElementById(`platform_${name}_status`)
        const fullPath = `/generated/${path}`
        if (lastHit[fullPath] && lastHit[fullPath] > lastBuild) {
            cell.innerText = 'Loaded'
            cell.style.backgroundColor = GREEN
        } else if (lastHit[fullPath]) {
            cell.innerText = 'Out of date'
            cell.style.backgroundColor = YELLOW
        } else {
            cell.innerText = 'Not yet loaded'
            cell.style.backgroundColor = RED
        }
    })
}

updateStatus()
setInterval(updateStatus, 500)
