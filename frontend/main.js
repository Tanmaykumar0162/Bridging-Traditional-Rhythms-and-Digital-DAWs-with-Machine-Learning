// ── Navbar Scroll Effect ───────────────────────────────────────────
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (navbar) {
        if (window.scrollY > 50) navbar.style.borderBottomColor = 'rgba(108,61,255,0.2)';
        else navbar.style.borderBottomColor = 'rgba(255,255,255,0.06)';
    }
});
