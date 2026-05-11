export function buildCertificateAuthHeaders(user) {
    if (!user) return {};
    const enc = (v) => encodeURIComponent(String(v ?? '').trim());
    const managedSites = Array.isArray(user.managed_sites)
        ? user.managed_sites
            .map((s) => String(s?.site_name || '').trim())
            .filter(Boolean)
        : [];
    return {
        'x-user-role': enc(user.role),
        'x-user-name': enc(user.name),
        'x-user-site': enc(user.site_name1 || user.site),
        'x-user-sites': enc(JSON.stringify(managedSites)),
    };
}
