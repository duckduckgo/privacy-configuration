const { Octokit } = require('@octokit/rest')
const fs = require('fs')

const githubToken = process.env.GITHUB_TOKEN
const repoFullName = process.env.GITHUB_REPOSITORY
const [owner, repo] = repoFullName.split('/')
const ev = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')
)
const prNumber = ev.pull_request.number

const octokit = new Octokit({
    auth: githubToken
})

async function main () {
    const diffOutput = fs.readFileSync('diff_output.txt', 'utf-8')

    let commentBody = `
Generated file outputs:

${diffOutput}
`

    if (commentBody.length > 65536) {
        commentBody = '❌ Generated diff output is too large to post as a comment, run locally to see the diff and validate'
    }

    await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody
    })
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
