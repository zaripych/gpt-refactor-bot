let glowEnabled = true;

export function isGlowEnabled() {
    const formattingDisabled =
        process.argv.includes('--no-md-format') ||
        !!process.env['NO_MD_FORMAT'];
    return !formattingDisabled && glowEnabled;
}

export function disableGlow() {
    glowEnabled = false;
}
