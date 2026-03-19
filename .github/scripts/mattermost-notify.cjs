const TEAMS = [
    {
        name: 'Windows',
        emoji: ':windows:',
        pattern: 'windows-config.json',
        webhookEnv: 'MM_WINDOWS_NOTIFY_WEBHOOK_URL',
        marker: 'windows-mm-notified',
    },
    {
        name: 'Android',
        emoji: ':android:',
        pattern: 'android-config.json',
        webhookEnv: 'MM_ANDROID_NOTIFY_WEBHOOK_URL',
        marker: 'android-mm-notified',
    },
    {
        name: 'iOS',
        emoji: ':iphone:',
        pattern: 'ios-config.json',
        webhookEnv: 'MM_IOS_NOTIFY_WEBHOOK_URL',
        marker: 'ios-mm-notified',
    },
    {
        name: 'macOS',
        emoji: ':macos:',
        pattern: 'macos-config.json',
        webhookEnv: 'MM_MACOS_NOTIFY_WEBHOOK_URL',
        marker: 'macos-mm-notified',
    },
    {
        name: 'Extensions',
        emoji: ':spider_web:',
        pattern: /extension(-\w+)?-config\.json/,
        webhookEnv: 'MM_EXTENSIONS_NOTIFY_WEBHOOK_URL',
        marker: 'extensions-mm-notified',
    },
];

function extractManualReviewSection(commentBody) {
    const match = commentBody.match(/## ❌ Manual Review Required([\s\S]*?)(?=\n## |$)/);
    return match ? match[1] : null;
}

function getTeamsRequiringReview(section) {
    return TEAMS.filter((t) => (typeof t.pattern === 'string' ? section.includes(t.pattern) : t.pattern.test(section)));
}

function formatNotificationText(team, pr) {
    return `:wave: Please review this ${team.emoji} Privacy Config PR for ${pr.user.login}:\n[\`${pr.title}\` - #${pr.number}](${pr.html_url})`;
}

module.exports = { TEAMS, extractManualReviewSection, getTeamsRequiringReview, formatNotificationText };
